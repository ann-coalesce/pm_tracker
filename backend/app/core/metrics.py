import math
from datetime import date
from decimal import Decimal
from typing import Optional


def calculate_equity_curve(returns: list[tuple[date, Decimal]]) -> list[dict]:
    """Returns list of {date, nav} starting from 1.0."""
    if not returns:
        return []
    sorted_returns = sorted(returns, key=lambda x: x[0])
    nav = Decimal("1.0")
    curve = []
    for d, r in sorted_returns:
        nav = nav * (1 + r)
        curve.append({"date": d, "nav": float(nav)})
    return curve


def calculate_metrics(
    returns: list[tuple[date, Decimal]],
    risk_free_rate: float = 0.0,
) -> dict:
    if len(returns) < 2:
        raise ValueError("Need at least 2 data points")

    sorted_returns = sorted(returns, key=lambda x: x[0])
    rets = [float(r) for _, r in sorted_returns]
    dates = [d for d, _ in sorted_returns]
    n = len(rets)

    # ── equity curve ──────────────────────────────────────────────
    nav = 1.0
    navs = []
    for r in rets:
        nav *= 1 + r
        navs.append(nav)

    total_return = navs[-1] - 1.0

    # ── CAGR ──────────────────────────────────────────────────────
    days_total = (dates[-1] - dates[0]).days or 1
    years = days_total / 365.0
    cagr = (navs[-1] ** (1 / years)) - 1 if years > 0 else 0.0

    # ── Volatility ────────────────────────────────────────────────
    mean = sum(rets) / n
    variance = sum((r - mean) ** 2 for r in rets) / (n - 1)
    daily_std = math.sqrt(variance)
    ann_volatility = daily_std * math.sqrt(365)

    neg_rets = [r for r in rets if r < 0]
    if len(neg_rets) >= 2:
        neg_mean = sum(neg_rets) / len(neg_rets)
        neg_var = sum((r - neg_mean) ** 2 for r in neg_rets) / (len(neg_rets) - 1)
        ann_downside_volatility = math.sqrt(neg_var) * math.sqrt(365)
    else:
        ann_downside_volatility = 0.0

    # ── Ratios ────────────────────────────────────────────────────
    excess = cagr - risk_free_rate
    sharpe = excess / ann_volatility if ann_volatility else None
    sortino = excess / ann_downside_volatility if ann_downside_volatility else None

    # ── Drawdown ──────────────────────────────────────────────────
    peak = navs[0]
    max_dd = 0.0
    max_dd_duration = 0
    current_dd_start_idx = 0
    dd_start_idx = 0

    for i, v in enumerate(navs):
        if v > peak:
            peak = v
            dd_start_idx = i
        dd = (v - peak) / peak
        if dd < max_dd:
            max_dd = dd
            max_dd_duration = (dates[i] - dates[dd_start_idx]).days

    # current drawdown from most recent peak
    peak_so_far = navs[0]
    for v in navs:
        if v > peak_so_far:
            peak_so_far = v
    current_drawdown = (navs[-1] - peak_so_far) / peak_so_far

    calmar: Optional[float] = (cagr / abs(max_dd)) if max_dd != 0.0 else None

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
