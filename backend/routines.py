"""Calendar recurrence in Australia/Sydney; no background scheduler required."""
import calendar
import datetime as dt
from zoneinfo import ZoneInfo
UTC=dt.timezone.utc
ZONE=ZoneInfo('Australia/Sydney')
REPEATS=('none','daily','weekdays','weekly','monthly')
CATEGORIES=('Groceries','Produce','Dairy','Household','Other')

def next_due(anchor, after, repeat):
    if repeat not in REPEATS[1:]:
        raise ValueError('Unsupported recurrence')
    original=dt.datetime.fromisoformat(anchor.replace('Z','+00:00')).astimezone(ZONE)
    cutoff=dt.datetime.fromisoformat(after.replace('Z','+00:00')).astimezone(UTC)
    local=cutoff.astimezone(ZONE)
    date=max(original.date(),local.date())
    for _ in range(370):
        eligible=(repeat in ('daily','weekdays') and (repeat!='weekdays' or date.weekday()<5)
                  or repeat=='weekly' and date.weekday()==original.weekday()
                  or repeat=='monthly' and date.day==min(original.day,calendar.monthrange(date.year,date.month)[1]))
        if eligible:
            wall=dt.datetime.combine(date,original.timetz().replace(tzinfo=None))
            # A spring-forward gap moves to the first valid minute; a repeated
            # autumn time uses the first occurrence and never fires twice.
            for minute in range(181):
                candidate=(wall+dt.timedelta(minutes=minute)).replace(tzinfo=ZONE,fold=0)
                utc=candidate.astimezone(UTC)
                if utc.astimezone(ZONE).replace(tzinfo=None)==candidate.replace(tzinfo=None):
                    if utc>cutoff:
                        return utc.isoformat()
                    break
        date+=dt.timedelta(days=1)
    raise ValueError('Could not resolve next recurrence')
