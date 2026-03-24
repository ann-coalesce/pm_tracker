import uuid
from datetime import date, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.pm import DailyReturn, PM, ReturnSourceConfig

router = APIRouter(prefix="/pms", tags=["nav-sync"])


@router.post("/{pm_id}/sync-nav")
async def sync_nav(pm_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    pm = await db.get(PM, pm_id)
    if pm is None:
        raise HTTPException(status_code=404, detail="PM not found")
    if not pm.nav_table_key:
        raise HTTPException(status_code=400, detail="nav_table_key is not set for this PM")

    # 1. Query daily NAV rows (00:00 UTC each day)
    nav_rows = await db.execute(
        text("""
            SELECT DATE(timestamp AT TIME ZONE 'UTC') AS d, nav
            FROM nav_table
            WHERE pm = :key
              AND EXTRACT(HOUR  FROM timestamp AT TIME ZONE 'UTC') = 0
              AND EXTRACT(MINUTE FROM timestamp AT TIME ZONE 'UTC') = 0
            ORDER BY d ASC
        """),
        {"key": pm.nav_table_key},
    )
    rows: list[tuple[date, Decimal]] = [(r[0], Decimal(str(r[1]))) for r in nav_rows.all()]

    if not rows:
        return {"inserted": 0, "updated": 0, "skipped": 0, "warnings": []}

    # 2. Delete all internal_nav and gap_filled rows for this PM
    await db.execute(
        delete(DailyReturn).where(
            DailyReturn.pm_id == pm_id,
            DailyReturn.source_type.in_(["internal_nav", "gap_filled"]),
        )
    )
    await db.commit()

    # 3. Compute and insert daily returns from NAV
    inserted = 0
    prev_nav: Decimal | None = None
    for d, nav in rows:
        if prev_nav is None or prev_nav == 0:
            ret = Decimal("0")
        else:
            ret = (nav / prev_nav) - Decimal("1")
        prev_nav = nav

        db.add(DailyReturn(
            pm_id=pm_id,
            date=d,
            return_pct=ret,
            source_type="internal_nav",
            is_verified=True,
        ))
        inserted += 1

    await db.commit()

    # 4. Gap-fill missing calendar dates between self_reported and internal_nav
    all_dr_result = await db.execute(
        select(DailyReturn.date, DailyReturn.source_type)
        .where(DailyReturn.pm_id == pm_id)
        .order_by(DailyReturn.date.asc())
    )
    all_dr_rows: list[tuple[date, str]] = [(r[0], r[1] or "self_reported") for r in all_dr_result.all()]
    all_dates = [r[0] for r in all_dr_rows]

    gap_missing: list[date] = []
    for gi in range(1, len(all_dates)):
        d = all_dates[gi - 1] + timedelta(days=1)
        while d < all_dates[gi]:
            gap_missing.append(d)
            d += timedelta(days=1)

    if gap_missing:
        ri = 0
        for gap_date in gap_missing:
            while ri + 1 < len(all_dr_rows) and all_dr_rows[ri + 1][0] < gap_date:
                ri += 1
            db.add(DailyReturn(
                pm_id=pm_id,
                date=gap_date,
                return_pct=Decimal("0"),
                source_type="gap_filled",
                is_verified=False,
                flag="gap_filled",
            ))
        await db.commit()

    # 5. Rebuild return_source_config from daily_return
    dr_result = await db.execute(
        select(DailyReturn.date, DailyReturn.source_type)
        .where(DailyReturn.pm_id == pm_id)
        .order_by(DailyReturn.date.asc())
    )
    dr_rows: list[tuple[date, str]] = [(r[0], r[1] or "self_reported") for r in dr_result.all()]

    segments: list[tuple[date, date | None, str]] = []
    if dr_rows:
        seg_start = dr_rows[0][0]
        seg_src   = dr_rows[0][1]
        for i in range(1, len(dr_rows)):
            d, src = dr_rows[i]
            if src != seg_src:
                segments.append((seg_start, dr_rows[i - 1][0], seg_src))
                seg_start = d
                seg_src   = src
        segments.append((seg_start, None, seg_src))

    await db.execute(
        delete(ReturnSourceConfig).where(ReturnSourceConfig.pm_id == pm_id)
    )
    for start, end, src in segments:
        db.add(ReturnSourceConfig(
            pm_id=pm_id,
            start_date=start,
            end_date=end,
            source_type=src,
            source_ref=pm.nav_table_key if src == "internal_nav" else None,
            note="Auto-detected from daily returns",
        ))

    await db.commit()
    return {"inserted": inserted, "updated": 0, "skipped": 0, "warnings": []}
