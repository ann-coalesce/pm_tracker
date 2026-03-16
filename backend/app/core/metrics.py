import math
from datetime import date
from decimal import Decimal
from typing import Optional


def _get_leverage_for_date(leverage_history: list[dict], d: date) -> float:
    """Return the leverage in effect on date d. Defaults to 1.0 if not found."""
    candidates = [
        e for e in leverage_history
        if e["start_date"] <= d and (e["end_date"] is None or e["end_date"] >= d)
    ]
    if not candidates:
        return 1.0
    best = max(candidates, key=lambda e: e["start_date"])
    return float(best["leverage"]) or 1.0


def calculate_equity_curve(
    returns: list[tuple[date, Decimal]],
    leverage_history: list[dict] | None = None,
) -> list[dict]:
    """Returns list of {date, nav, std_nav} starting from 1.0.

    std_nav uses returns normalised by the leverage in effect on each date.
    When leverage_history is empty/None, std_nav == nav.
    """
    if not returns:
        return []
    lev_hist = leverage_history or []
    sorted_returns = sorted(returns, key=lambda x: x[0])
    nav = Decimal("1.0")
    std_nav = Decimal("1.0")
    curve = []
    for d, r in sorted_returns:
        nav = nav * (1 + r)
        lev = _get_leverage_for_date(lev_hist, d)
        std_r = r / Decimal(str(lev))
        std_nav = std_nav * (1 + std_r)
        curve.append({"date": d, "nav": float(nav), "std_nav": float(std_nav)})
    return curve


def calculate_metrics(
    returns: list[tuple[date, Decimal]],
    risk_free_rate: float = 0.0,
    leverage_history: list[dict] | None = None,
) -> dict:
    if len(returns) < 2:
        raise ValueError("Need at least 2 data points")

    lev_hist = leverage_history or []
    sorted_returns = sorted(returns, key=lambda x: x[0])
    rets = [float(r) for _, r in sorted_returns]
    dates = [d for d, _ in sorted_returns]
    n = len(rets)

    # std_return series: normalised by leverage
    std_rets = [
        float(r) / _get_leverage_for_date(lev_hist, d)
        for d, r in sorted_returns
    ]

    # ── equity curve ──────────────────────────────────────────────
    nav = 1.0
    navs = []
    for r in rets:
        nav *= 1 + r
        navs.append(nav)

    total_return = navs[-1] - 1.0

    # std equity curve
    std_nav = 1.0
    std_navs = []
    for r in std_rets:
        std_nav *= 1 + r
        std_navs.append(std_nav)

    std_total_return = std_navs[-1] - 1.0

    # ── CAGR ──────────────────────────────────────────────────────
    days_total = (dates[-1] - dates[0]).days or 1
    years = days_total / 365.0
    cagr = (navs[-1] ** (1 / years)) - 1 if years > 0 else 0.0
    std_cagr = (std_navs[-1] ** (1 / years)) - 1 if years > 0 else 0.0

    # ── Volatility ────────────────────────────────────────────────
    mean = sum(rets) / n
    variance = sum((r - mean) ** 2 for r in rets) / (n - 1)
    daily_std = math.sqrt(variance)
    ann_volatility = daily_std * math.sqrt(365)

    std_mean = sum(std_rets) / n
    std_variance = sum((r - std_mean) ** 2 for r in std_rets) / (n - 1)
    std_daily_std = math.sqrt(std_variance)
    std_ann_volatility = std_daily_std * math.sqrt(365)

    neg_rets = [r for r in rets if r < 0]
    if len(neg_rets) >= 2:
        neg_mean = sum(neg_rets) / len(neg_rets)
        neg_var = sum((r - neg_mean) ** 2 for r in neg_rets) / (len(neg_rets) - 1)
        ann_downside_volatility = math.sqrt(neg_var) * math.sqrt(365)
    else:
        ann_downside_volatility = 0.0

    std_neg_rets = [r for r in std_rets if r < 0]
    if len(std_neg_rets) >= 2:
        std_neg_mean = sum(std_neg_rets) / len(std_neg_rets)
        std_neg_var = sum((r - std_neg_mean) ** 2 for r in std_neg_rets) / (len(std_neg_rets) - 1)
        std_ann_downside_volatility = math.sqrt(std_neg_var) * math.sqrt(365)
    else:
        std_ann_downside_volatility = 0.0

    # ── Ratios ────────────────────────────────────────────────────
    excess = cagr - risk_free_rate
    sharpe = excess / ann_volatility if ann_volatility else None
    sortino = excess / ann_downside_volatility if ann_downside_volatility else None

    std_excess = std_cagr - risk_free_rate
    std_sharpe = std_excess / std_ann_volatility if std_ann_volatility else None
    std_sortino = std_excess / std_ann_downside_volatility if std_ann_downside_volatility else None

    # ── Drawdown ──────────────────────────────────────────────────
    peak = navs[0]
    max_dd = 0.0
    max_dd_duration = 0
    dd_start_idx = 0

    for i, v in enumerate(navs):
        if v > peak:
            peak = v
            dd_start_idx = i
        dd = (v - peak) / peak
        if dd < max_dd:
            max_dd = dd
            max_dd_duration = (dates[i] - dates[dd_start_idx]).days

    peak_so_far = navs[0]
    for v in navs:
        if v > peak_so_far:
            peak_so_far = v
    current_drawdown = (navs[-1] - peak_so_far) / peak_so_far

    std_peak = std_navs[0]
    std_max_dd = 0.0
    std_max_dd_duration = 0
    std_dd_start_idx = 0

    for i, v in enumerate(std_navs):
        if v > std_peak:
            std_peak = v
            std_dd_start_idx = i
        dd = (v - std_peak) / std_peak
        if dd < std_max_dd:
            std_max_dd = dd
            std_max_dd_duration = (dates[i] - dates[std_dd_start_idx]).days

    std_peak_so_far = std_navs[0]
    for v in std_navs:
        if v > std_peak_so_far:
            std_peak_so_far = v
    std_current_drawdown = (std_navs[-1] - std_peak_so_far) / std_peak_so_far

    calmar: Optional[float] = (cagr / abs(max_dd)) if max_dd != 0.0 else None
    std_calmar: Optional[float] = (std_cagr / abs(std_max_dd)) if std_max_dd != 0.0 else None

    # ── Win rate ──────────────────────────────────────────────────
    pos_rets = [r for r in rets if r > 0]
    win_rate = len(pos_rets) / n
    avg_win = sum(pos_rets) / len(pos_rets) if pos_rets else 0.0
    avg_loss = sum(neg_rets) / len(neg_rets) if neg_rets else 0.0

    return {
        "total_return": total_return,
        "cagr": cagr,
        "ann_volatility": ann_volatility,
        "ann_downside_volatility": ann_downside_volatility,
        "sharpe_ratio": sharpe,
        "sortino_ratio": sortino,
        "max_drawdown": max_dd,
        "max_drawdown_duration_days": max_dd_duration,
        "calmar_ratio": calmar,
        "current_drawdown": current_drawdown,
        "win_rate": win_rate,
        "avg_win": avg_win,
        "avg_loss": avg_loss,
        "track_record_days": n,
        "track_record_start": dates[0],
        "track_record_end": dates[-1],
        # std (leverage-normalised) metrics
        "std_total_return": std_total_return,
        "std_cagr": std_cagr,
        "std_ann_volatility": std_ann_volatility,
        "std_ann_downside_volatility": std_ann_downside_volatility,
        "std_sharpe_ratio": std_sharpe,
        "std_sortino_ratio": std_sortino,
        "std_max_drawdown": std_max_dd,
        "std_max_drawdown_duration_days": std_max_dd_duration,
        "std_calmar_ratio": std_calmar,
        "std_current_drawdown": std_current_drawdown,
    }


def calculate_rolling_metrics(
    returns: list[tuple[date, Decimal]],
    window_days: int,
    risk_free_rate: float = 0.0,
) -> list[dict]:
    sorted_returns = sorted(returns, key=lambda x: x[0])
    results = []
    for i in range(window_days - 1, len(sorted_returns)):
        window = sorted_returns[i - window_days + 1 : i + 1]
        rets = [float(r) for _, r in window]
        n = len(rets)
        mean = sum(rets) / n
        var = sum((r - mean) ** 2 for r in rets) / (n - 1) if n > 1 else 0
        daily_std = math.sqrt(var)
        ann_vol = daily_std * math.sqrt(365)
        ann_ret = (math.prod(1 + r for r in rets) ** (365 / n)) - 1
        sharpe = (ann_ret - risk_free_rate) / ann_vol if ann_vol else None
        results.append({
            "date": sorted_returns[i][0],
            "sharpe": sharpe,
            "volatility": ann_vol,
        })
    return results
