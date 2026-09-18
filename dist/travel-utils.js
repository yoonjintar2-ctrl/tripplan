export function travelersFor(trip, members = []) {
  if (Array.isArray(trip.travelers) && trip.travelers.length) return trip.travelers;
  return members.map((member, index) => ({id: member.user_id, nickname: member.display_name || '여행자', avatar: `male-${String(index % 200 + 1).padStart(3, '0')}`}));
}
export function attendeesFor(item, travelers) {
  return item.participant_ids == null ? travelers : travelers.filter(person => item.participant_ids.includes(person.id));
}
export function allocateCost(item, travelers) {
  if (!item.settlement_enabled || !Number(item.cost_won)) return {};
  const people = attendeesFor(item, travelers);
  if (!people.length) return {};
  const custom = Object.keys(item.split_ratios || {}).length > 0;
  const weights = people.map(p => custom ? Math.max(0, Number(item.split_ratios[p.id]) || 0) : 1);
  const sum = weights.reduce((a,b) => a+b,0);
  if (!sum) return {};
  const total = Math.round(Number(item.cost_won));
  const raw = people.map((p,i) => ({id:p.id, value:total * weights[i] / sum}));
  const result = Object.fromEntries(raw.map(p => [p.id,Math.floor(p.value)]));
  let remainder = total - Object.values(result).reduce((a,b) => a+b,0);
  raw.sort((a,b) => (b.value % 1) - (a.value % 1)).forEach(p => {if (remainder > 0){result[p.id]++;remainder--;}});
  return result;
}
export function isGoogleMapsUrl(value) {
  try {const u=new URL(value);return u.protocol==='https:' && !u.username && !u.password && !u.port && (u.hostname==='maps.app.goo.gl' || (u.hostname==='goo.gl' && u.pathname.startsWith('/maps/')) || /^(www\.|maps\.)?google\.(com|co\.kr|co\.jp|co\.uk|com\.au|ca|de|fr|it|es|co\.in|com\.tw|com\.hk|com\.sg)$/.test(u.hostname) && (u.pathname.startsWith('/maps') || u.hostname.startsWith('maps.')));} catch{return false;}
}
export function parseMapsUrl(value) {
  if (!isGoogleMapsUrl(value)) throw new Error('Google 지도에서 복사한 https 링크를 넣어 주세요.');
  const u = new URL(value);
  const decoded = decodeURIComponent(u.href);
  const placeId = u.searchParams.get('query_place_id') || (u.searchParams.get('q') || '').match(/^place_id:(.+)$/)?.[1] || decoded.match(/!1s(ChI[^!/?&]+)/)?.[1];
  const point = decoded.match(/!3d(-?[\d.]+)!4d(-?[\d.]+)/);
  const q = u.searchParams.get('query') || u.searchParams.get('q') || '';
  const coordinates = point || q.match(/^\s*(-?[\d.]+),\s*(-?[\d.]+)\s*$/);
  const viewport = decoded.match(/@(-?[\d.]+),(-?[\d.]+)/);
  const location = coordinates ? {lat:Number(coordinates[1]),lng:Number(coordinates[2])} : null;
  const bias = location || (viewport ? {lat:Number(viewport[1]),lng:Number(viewport[2])} : null);
  if (bias && (Math.abs(bias.lat)>90 || Math.abs(bias.lng)>180)) throw new Error('지도 좌표를 확인할 수 없습니다.');
  const pathName = u.pathname.match(/\/maps\/place\/([^/]+)/)?.[1];
  const name = pathName ? decodeURIComponent(pathName).replace(/\+/g,' ') : (!coordinates && !q.startsWith('place_id:') ? q : '');
  return {url:u.href,placeId:placeId || null,name,location,bias,short:u.hostname==='maps.app.goo.gl'||u.hostname==='goo.gl'};
}
export function personStops(items, personId) {
  return items.filter(item => item.participant_ids == null || item.participant_ids.includes(personId));
}
