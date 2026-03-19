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

    # Query daily NAV rows (00:00 UTC each day)
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

    # Fetch existing daily_return dates + source_types for this PM
    existing_result = await db.execute(
        select(DailyReturn.date, DailyReturn.source_type, DailyReturn.id)
        .where(DailyReturn.pm_id == pm_id)
    )
    existing: dict[date, tuple[str, uuid.UUID]] = {
        r[0]: (r[1], r[2]) for r in existing_result.all()
    }

    inserted = updated = skipped = 0
    warnings: list[str] = []

    prev_nav: Decimal | None = None
    for d, nav in rows:
        # Compute return
        if prev_nav is None or prev_nav == 0:
            ret = Decimal("0")
        else:
            ret = (nav / prev_nav) - Decimal("1")
        prev_nav = nav

        if d in existing:
            src, row_id = existing[d]
            row = await db.get(DailyReturn, row_id)
            if row:
                row.return_pct = ret
                row.source_type = "internal_nav"
                row.is_verified = True
                updated += 1
        else:
            db.add(DailyReturn(
                pm_id=pm_id,
                date=d,
                return_pct=ret,
                source_type="internal_nav",
                is_verified=True,
            ))
            inserted += 1

    await db.commit()

    # --- Gap-fill the full date sequence for this PM ---
    gap_dr_result = await db.execute(
        select(DailyReturn.date, DailyReturn.source_type)
        .where(DailyReturn.pm_id == pm_id)
        .order_by(DailyReturn.date.asc())
    )
    gap_rows: list[tuple[date, str]] = [(r[0], r[1] or "self_reported") for r in gap_dr_result.all()]
    gap_dates = [r[0] for r in gap_rows]
    # find missing calendar dates
    gap_missing: list[date] = []
    for gi in range(1, len(gap_dates)):
        d = gap_dates[gi - 1] + timedelta(days=1)
        while d < gap_dates[gi]:
            gap_missing.append(d)
            d += timedelta(days=1)
    if gap_missing:
        ri = 0
        for gap_date in gap_missing:
            while ri + 1 < len(gap_rows) and gap_rows[ri + 1][0] < gap_date:
                ri += 1
            db.add(DailyReturn(
                pm_id=pm_id,
                date=gap_date,
                return_pct=Decimal("0"),
                source_type="internal_nav",
                is_verified=False,
                flag="gap_filled",
            ))
        await db.commit()

    # --- Rebuild return_source_config from daily_return ---
    # 1. Fetch all daily returns for this PM ordered by date
    dr_result = await db.execute(
        select(DailyReturn.date, DailyReturn.source_type)
        .where(DailyReturn.pm_id == pm_id)
        .order_by(DailyReturn.date.asc())
    )
    dr_rows: list[tuple[date, str]] = [(r[0], r[1] or "self_reported") for r in dr_result.all()]

    # 2. Detect segments of consecutive identical source_type
    segments: list[tuple[date, date | None, str]] = []  # (start, end, source_type)
    if dr_rows:
        seg_start = dr_rows[0][0]
        seg_src   = dr_rows[0][1]
        for i in range(1, len(dr_rows)):
            d, src = dr_rows[i]
            if src != seg_src:
                segments.append((seg_start, dr_rows[i - 1][0], seg_src))
                seg_start = d
                seg_src   = src
        # Last segment has end_date = None (open)
        segments.append((seg_start, None, seg_src))

    # 3. Delete existing return_source_config for this PM
    await db.execute(
        delete(ReturnSourceConfig).where(ReturnSourceConfig.pm_id == pm_id)
    )

    # 4. Re-insert segments
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
    return {"inserted": inserted, "updated": updated, "skipped": skipped, "warnings": warnings}
