// A reminder interval is measured in calendar weeks, independently of monthly reports.
function dateInZone(value,timezone){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(value));
  const part=type=>parts.find(p=>p.type===type).value;return part('year')+'-'+part('month')+'-'+part('day');
}
export function reviewSchedule(row,cfg){
  const weeks=row.review_interval_weeks||4;
  const anchor=dateInZone(row.latest_published_at||row.joined_at,cfg.timezone);
  const date=new Date(anchor+'T12:00:00Z');
  if(row.latest_published_at)date.setUTCDate(date.getUTCDate()+weeks*7);
  const nextReviewDate=date.toISOString().slice(0,10);
  return {reviewIntervalWeeks:weeks,nextReviewDate,reviewDue:nextReviewDate<=cfg.today};
}
