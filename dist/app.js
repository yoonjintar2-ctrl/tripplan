import {travelersFor, attendeesFor, allocateCost, parseMapsUrl, isGoogleMapsUrl, personStops} from "./travel-utils.js";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.111.0/+esm";

const SUPABASE_URL = "https://jiaqobfriamuxtvxhrls.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_OQ50_TYVty0yFuVVrbe7kA_Kn9uZ5bR";
const GOOGLE_MAPS_KEY = "AIzaSyDXMAandzVKkP0uutdEZ2Qdn7jTs0MCBvw";
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { flowType: "pkce", persistSession: true, detectSessionInUrl: true }
});

const $ = (selector, parent = document) => parent.querySelector(selector);
const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];
const won = value => `₩${Math.round(Number(value || 0)).toLocaleString("ko-KR")}`;
const safe = value => String(value ?? "").replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

const iconGroups = [
  { name: "추천", keywords: "기본 점 장소 일정 추천 약속", values: "• 📍 ⭐ ❤️ 💙 ✅ 💡 📷 🎫 🧭 🗺️ ☕ 🍜 🍱 🚆 ✈️ 🚌 🚕 🚗 🏨 🛍️ 🌿 🎁" },
  { name: "음식·카페", keywords: "음식 식당 맛집 카페 커피 디저트 술 바 아침 점심 저녁", values: "🍏 🍎 🍐 🍊 🍋 🍋‍🟩 🍌 🍉 🍇 🍓 🫐 🍈 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🍆 🥑 🫛 🥦 🥬 🥒 🌶️ 🫑 🌽 🥕 🫒 🧄 🧅 🥔 🍠 🫘 🌰 🫚 🫛 🍞 🥐 🥖 🫓 🥨 🥯 🥞 🧇 🧀 🍖 🍗 🥩 🥓 🍔 🍟 🍕 🌭 🥪 🌮 🌯 🫔 🥙 🧆 🥚 🍳 🥘 🍲 🫕 🥣 🥗 🍿 🧈 🧂 🥫 🍱 🍘 🍙 🍚 🍛 🍜 🍝 🍢 🍣 🍤 🍥 🥮 🍡 🥟 🥠 🥡 🦪 🍦 🍧 🍨 🍩 🍪 🎂 🍰 🧁 🥧 🍫 🍬 🍭 🍮 🍯 ☕ 🍵 🫖 🧋 🥤 🧃 🧉 🥛 🍺 🍻 🥂 🍷 🥃 🍸 🍹 🍾" },
  { name: "이동", keywords: "이동 교통 기차 전철 지하철 버스 택시 자동차 렌터카 비행기 공항 배 자전거 도보", values: "🚶 🚶‍♀️ 🚶‍♂️ 🧍 🧍‍♀️ 🧍‍♂️ 🧳 🎒 👣 🚲 🛴 🛵 🏍️ 🚗 🚕 🚙 🚌 🚎 🏎️ 🚓 🚑 🚒 🚐 🛻 🚚 🚛 🚜 🦽 🦼 🛺 🚃 🚋 🚞 🚝 🚄 🚅 🚈 🚂 🚆 🚇 🚊 ✈️ 🛫 🛬 🛩️ 💺 🚁 🚟 🚠 🚡 🛰️ 🚀 🛸 ⛵ 🛶 🚤 🛥️ 🛳️ ⛴️ 🚢 ⚓ 🛟 ⛽ 🚧 🚦 🚥 🗿" },
  { name: "숙소", keywords: "숙소 호텔 리조트 체크인 캠핑 집 휴식", values: "🏨 🏩 🏠 🏡 🏘️ 🏚️ 🛖 ⛺ 🏕️ 🏢 🏬 🏙️ 🌃 🛎️ 🔑 🗝️ 🚪 🛏️ 🛋️ 🪑 🚿 🛁 🧴 🧼 🪥 🧻 🧺 🧹 🧽 🪣 🪟 🪞 🧸 😴 💤" },
  { name: "관광·문화", keywords: "관광 명소 박물관 미술관 사찰 절 신사 성 역사 문화 건축", values: "🏯 ⛩️ 🏛️ 🕌 🕍 🛕 ⛪ 🏰 🗼 🗽 🗿 🗺️ 🌐 🧭 🎨 🖼️ 🧵 🪡 🧶 🏺 📜 📚 📖 📰 🎭 🎬 🎥 📽️ 🎞️ 🎪 🎡 🎢 🎠 ⛲ 🏟️ 🏫 🏭 🏗️ 🧱 🪨 🪵 🪧 🚩 🏳️ 🏁 🎌" },
  { name: "자연·날씨", keywords: "자연 공원 산 바다 해변 날씨 일출 일몰 꽃 나무", values: "🌿 ☘️ 🍀 🍃 🍂 🍁 🌱 🪴 🌵 🌴 🌳 🌲 🎋 🎍 🌾 💐 🌷 🌹 🥀 🪻 🪷 🌺 🌸 🌼 🌻 🍄 🪸 🌍 🌎 🌏 🌋 ⛰️ 🏔️ 🏞️ 🏖️ 🏝️ 🏜️ 🌅 🌄 🌇 🌆 🌌 🌉 🌁 ☀️ 🌤️ ⛅ 🌥️ ☁️ 🌦️ 🌧️ ⛈️ 🌩️ 🌨️ ❄️ ☃️ ⛄ 🌬️ 💨 🌪️ 🌈 ☔ 💧 🌊" },
  { name: "활동·스포츠", keywords: "활동 액티비티 스포츠 운동 놀이 수영 등산 골프 경기", values: "⚽ 🏀 🏈 ⚾ 🥎 🎾 🏐 🏉 🥏 🎱 🪀 🏓 🏸 🏒 🏑 🥍 🏏 🪃 🥅 ⛳ 🪁 🏹 🎣 🤿 🥊 🥋 🎽 🛹 🛼 🛷 ⛸️ 🥌 🎿 ⛷️ 🏂 🪂 🏋️ 🤼 🤸 ⛹️ 🤺 🤾 🏌️ 🏇 🧘 🏄 🏊 🤽 🚣 🧗 🚵 🚴 🏆 🥇 🥈 🥉 🏅 🎖️" },
  { name: "쇼핑", keywords: "쇼핑 상점 시장 기념품 선물 패션 옷 가방", values: "🛍️ 🎁 🛒 🏪 🏬 💳 💵 💴 💶 💷 🪙 💰 💎 👛 👜 👝 🎒 🧳 👓 🕶️ 🥽 👔 👕 👖 🧣 🧤 🧥 🧦 👗 👘 🥻 🩱 🩲 🩳 👙 👚 🪭 👞 👟 🥾 🥿 👠 👡 🩰 👢 👑 👒 🎩 🎓 🧢 🪖 ⌚ 💍 💄" },
  { name: "공연·즐길거리", keywords: "공연 음악 콘서트 축제 파티 노래 영화 게임", values: "🎵 🎶 🎼 🎤 🎧 📻 🎷 🪗 🎸 🎹 🎺 🎻 🪕 🥁 🪘 🪇 🪈 🎙️ 🎚️ 🎛️ 🕺 💃 🪩 🎉 🎊 🎈 🎆 🎇 🧨 ✨ 🎃 🎄 🎐 🎎 🎏 🎑 🧧 🎀 🎟️ 🎫 🎮 🕹️ 🎰 🎲 🧩 ♟️ 🎯 🎳 🎴 🃏 🀄" },
  { name: "휴식·건강", keywords: "휴식 건강 병원 약 마사지 스파 온천 뷰티", values: "♨️ 💆 💆‍♀️ 💆‍♂️ 🧖 🧖‍♀️ 🧖‍♂️ 🛀 💅 🧘 😌 🫧 🕯️ 🪔 🩺 💊 💉 🩹 🩼 🩻 🏥 🚑 ❤️‍🩹 🫶 🤍 💚 💛 🧡 💜 🩵 🩷 🩶 🖤" },
  { name: "도구·기타", keywords: "도구 예약 확인 전화 시간 위치 알림 문서 사진 기타", values: "📌 📍 🗓️ 📅 ⏰ ⌚ ⏳ ⌛ 🔔 📣 📢 💬 💭 🗨️ 📞 ☎️ 📱 💻 ⌨️ 🖥️ 🖨️ 📸 📹 🔍 🔎 🔦 💡 📝 ✏️ 🖊️ 📎 📏 ✂️ 🔒 🔓 🔐 🔑 ✅ ☑️ ✔️ ❌ ❗ ❓ ⚠️ ℹ️ ➕ ➖ ➡️ ⬅️ ⬆️ ⬇️ 🔄 🔗 📶 🔋 🔌" }
].map(group => ({ ...group, values: group.values.split(" ") }));
const icons = [{ value: "", group: "추천", keywords: "기본 점 없음" }, ...iconGroups.flatMap(group => group.values.map(value => ({ value, group: group.name, keywords: `${group.name} ${group.keywords}` })))];

function todayString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
function blankTrip() {
  const today = todayString();
  return {
    id: null, owner_id: null, title: "새 여행을 만들어 주세요", destination: "NEXT DESTINATION",
    start_date: today, end_date: today, categories: ["음식", "관광", "이동", "쇼핑"], share_code: ""
  };
}

const state = {
  session: null,
  trip: blankTrip(),
  trips: [],
  members: [],
  items: [],
  activeDate: todayString(),
  selectedId: null,
  pendingPlace: null,
  map: null,
  markers: new Map(),
  route: null, routes: [], travelerMarkers: new Map(), mapRenderRequest: 0, routeAnimation: 0, routeDate: null,
  participantIds: null, travelerFilter: "all", draftTravelers: [], editorMap: null, editorMarker: null, editorMapRequest: 0,
  mapReady: false,
  placeCache: new Map(),
  placePreviewRequest: 0,
  placeResolveRequest: 0,
  lastSavedAt: null,
  realtimeChannel: null,
  reloadTimer: null,
  toastTimer: null
};

function parseLocalDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}
function dateRange(start, end) {
  const dates = [];
  const cursor = parseLocalDate(start);
  const last = parseLocalDate(end);
  while (cursor <= last && dates.length < 60) {
    dates.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`);
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}
function formatDate(value, long = false) {
  return new Intl.DateTimeFormat("ko-KR", long ? { month: "long", day: "numeric", weekday: "long" } : { month: "numeric", day: "numeric", weekday: "short" }).format(parseLocalDate(value));
}
function formatTime(value) {
  return value ? String(value).slice(0, 5) : "미정";
}
function initials(name) {
  return [...String(name || "여행자")][0] || "여";
}
function itemPosition(item) {
  if (item?.latitude == null || item?.longitude == null) return null;
  const latitude = Number(item.latitude);
  const longitude = Number(item.longitude);
  return Number.isFinite(latitude) && Number.isFinite(longitude) ? { lat: latitude, lng: longitude } : null;
}
function selectedItem() {
  return state.items.find(item => item.id === state.selectedId) || null;
}
function activeItems(ignoreFilter = false) {
  return state.items.filter(item => item.item_date === state.activeDate && (ignoreFilter || state.travelerFilter === "all" || item.participant_ids == null || item.participant_ids.includes(state.travelerFilter))).sort((a, b) => {
    const byTime = (a.start_time || "99:99").localeCompare(b.start_time || "99:99");
    return byTime || Number(a.sort_order || 0) - Number(b.sort_order || 0);
  });
}
function canEdit() {
  if (!state.session || !state.trip.id) return false;
  if (state.trip.owner_id === state.session.user.id) return true;
  return state.members.some(member => member.user_id === state.session.user.id && ["owner", "editor"].includes(member.role));
}
function currentRole(trip = state.trip) {
  if (!state.session || !trip?.id) return "viewer";
  if (trip.owner_id === state.session.user.id) return "owner";
  return state.members.find(member => member.user_id === state.session.user.id)?.role || "viewer";
}
function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}
function setSync(message) {
  if (/저장|동기화|연결/.test(message)) state.lastSavedAt = new Date();
  updateAutoSaveStatus(message);
}
function updateAutoSaveStatus(fallback = "") {
  const label = $("#syncStatus");
  if (state.session && state.lastSavedAt) {
    const minutes = Math.max(0, Math.floor((Date.now() - state.lastSavedAt.getTime()) / 60000));
    label.textContent = `${String(minutes).padStart(2, "0")}분 전 자동 저장됨`;
  } else if (!state.session && new URLSearchParams(location.search).has("trip")) {
    label.textContent = "공개 열람 중 · 로그인 후 수정";
  } else {
    label.textContent = fallback || "Google 로그인 후 자동 저장";
  }
}

function renderMember(element, member, title = "") {
  const label = member.display_name || "여행자";
  element.className = "member";
  element.title = title || label;
  element.innerHTML = member.avatar_url ? `<img src="${safe(member.avatar_url)}" alt="${safe(label)}">` : safe(initials(label));
}
function renderMembers() {
  const stack = $("#memberStack");
  stack.innerHTML = "";
  state.members.slice(0, 5).forEach(member => {
    const node = document.createElement("span");
    renderMember(node, member);
    stack.append(node);
  });
  if (state.members.length > 5) {
    const more = document.createElement("span");
    more.className = "member";
    more.textContent = `+${state.members.length - 5}`;
    stack.append(more);
  }
  const permissions = $("#memberPermissions");
  permissions.innerHTML = "";
  state.members.forEach(member => {
    const row = document.createElement("div");
    const avatar = document.createElement("span");
    renderMember(avatar, member);
    const copy = document.createElement("span");
    const owner = member.role === "owner" || member.user_id === state.trip.owner_id;
    copy.innerHTML = `<strong>${safe(member.display_name || "여행자")}</strong><small>${owner ? "여행 소유자" : member.role === "viewer" ? "열람 가능" : "함께 편집 중"}</small>`;
    row.append(avatar, copy);
    if (state.session?.user.id === state.trip.owner_id && !owner) {
      const select = document.createElement("select");
      select.setAttribute("aria-label", `${member.display_name} 권한`);
      select.innerHTML = `<option value="editor">편집 가능</option><option value="viewer">열람만</option>`;
      select.value = member.role;
      select.addEventListener("change", () => updateMemberRole(member.user_id, select.value));
      row.append(select);
    } else {
      const role = document.createElement("span");
      role.textContent = owner ? "모든 권한" : member.role === "viewer" ? "열람만" : "편집 가능";
      row.append(role);
    }
    permissions.append(row);
  });
}

function renderTripSwitcher() {
  const select = $("#tripSelect");
  if (!state.session) {
    select.innerHTML = `<option>${state.trip.id ? safe(state.trip.title) : "Google 로그인 후 여행 관리"}</option>`;
    select.disabled = true;
  } else if (!state.trips.length) {
    select.innerHTML = `<option value="">아직 만든 여행이 없습니다</option>`;
    select.disabled = true;
  } else {
    select.innerHTML = state.trips.map(trip => `<option value="${safe(trip.id)}">${safe(trip.title)}</option>`).join("");
    select.value = state.trip.id || state.trips[0].id;
    select.disabled = false;
  }
  $("#manageTripsButton").textContent = state.session ? "여행 관리" : "로그인하여 만들기";
}

function render() {
  const dates = dateRange(state.trip.start_date, state.trip.end_date);
  if (!dates.includes(state.activeDate)) state.activeDate = dates[0];
  const items = activeItems();
  if (state.selectedId && !items.some(item => item.id === state.selectedId)) state.selectedId = null;
  const selected = selectedItem();

  document.title = state.trip.id ? `${state.trip.title} — 여행계획닷컴 beta` : "여행계획닷컴 beta";
  $("#dayTabs").innerHTML = dates.map((date, index) => {
    const value = parseLocalDate(date);
    return `<button class="day-tab ${date === state.activeDate ? "active" : ""}" type="button" role="tab" aria-selected="${date === state.activeDate}" data-date="${date}"><span>DAY ${String(index + 1).padStart(2, "0")}</span><strong>${value.getMonth() + 1}월 ${String(value.getDate()).padStart(2, "0")}일 ${new Intl.DateTimeFormat("ko-KR", { weekday: "short" }).format(value).replace("요일", "")}</strong></button>`;
  }).join("");
  $$("[data-date]").forEach(button => button.addEventListener("click", () => {
    state.activeDate = button.dataset.date;
    state.selectedId = null;
    render();
  }));

  $("#itemCount").textContent = `${items.length}개의 일정`;
  $("#mapDayLabel").textContent = `DAY ${String(dates.indexOf(state.activeDate) + 1).padStart(2, "0")} · ${state.trip.destination || "동선"}`;
  $("#totalCost").textContent = won(state.items.reduce((sum, item) => sum + (item.settlement_enabled ? Number(item.cost_won || 0) : 0), 0));
  renderTravelerFilter();
  $("#agendaList").innerHTML = items.length ? items.map(item => {
    const current = isCurrentItem(item, items);
    return `<div class="agenda-item ${item.id === state.selectedId ? "is-selected" : ""} ${current ? "is-current" : ""}"><button class="agenda-select" type="button" data-item-id="${safe(item.id)}"><span class="agenda-time">${safe(formatTime(item.start_time))}</span><span class="agenda-copy"><strong><span>${safe(item.icon || "•")} ${safe(item.name)}</span><small>${safe(item.category || "미분류")}</small></strong><p>${safe(item.memo || "")}</p>${item.participant_ids ? `<div class="agenda-attendees">${attendeesFor(item, travelers()).map(person => faceHtml(person, "")).join("")} ${attendeesFor(item, travelers()).map(person => safe(person.nickname)).join(" · ")}</div>` : ""}</span></button><button class="agenda-edit-button" type="button" data-edit-item="${safe(item.id)}" aria-label="${safe(item.name)} 수정">✎</button></div>`;
  }).join("") : `<div class="agenda-empty">아직 일정이 없습니다.<br>첫 일정을 추가해 보세요.</div>`;
  $$("[data-item-id]").forEach(button => {
    button.addEventListener("click", () => selectStop(button.dataset.itemId, true));
    button.addEventListener("mouseenter", () => previewStop(button.dataset.itemId));
    button.addEventListener("mouseleave", () => previewStop(state.selectedId));
  });
  $$("[data-edit-item]").forEach(button => button.addEventListener("click", () => {
    const item = state.items.find(value => value.id === button.dataset.editItem);
    openSchedule(item);
  }));
  updatePlaceCard(selected);
  renderMap();
  renderMembers();
  renderTripSwitcher();
  updateAccountUI();
}

function isCurrentItem(item, items) {
  const today = new Date();
  const dateString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  if (item.item_date !== dateString) return false;
  const now = `${String(today.getHours()).padStart(2, "0")}:${String(today.getMinutes()).padStart(2, "0")}`;
  const current = [...items].reverse().find(candidate => formatTime(candidate.start_time) <= now) || items[0];
  return current?.id === item.id;
}
function updatePlaceCard(item) {
  const items = activeItems();
  const index = item ? items.findIndex(value => value.id === item.id) : -1;
  $("#routeCounter").textContent = `${index >= 0 ? index + 1 : 0} / ${items.length}`;
  $("#previousStop").disabled = index <= 0;
  $("#nextStop").disabled = !items.length || index >= items.length - 1;
  $("#placeCard").hidden = !item;
  state.previewItemId = item?.id || null;
  if (!item) { state.placePreviewRequest++; return; }
  $("#placeCategory").textContent = `${item.category || "미분류"} · ${formatTime(item.start_time)}`;
  $("#placeName").textContent = item.name;
  $("#placeMemo").textContent = item.memo || "";
  $("#placeMemo").hidden = !item.memo;
  $("#placeRating").textContent = item.maps_url ? "Google 지도" : "장소 미등록";
  if (item.place_id) renderPlacePreview(item);
  else {state.placePreviewRequest++; $("#placePreview").innerHTML = '<div class="place-preview-empty">선택된 Google 장소의 사진과 리뷰가 여기에 표시됩니다.</div>'; $("#placeReviewSnippet").textContent = '';}
}
async function renderPlacePreview(item) {
  const requestId = ++state.placePreviewRequest;
  const preview = $("#placePreview");
  preview.innerHTML = Array.from({length:3},()=>'<span class="photo-skeleton" aria-hidden="true"></span>').join('');
  $("#placeReviewSnippet").textContent = "Google 리뷰를 불러오는 중";
  try {
    const place = await getPlaceDetails(item);
    if (requestId !== state.placePreviewRequest || state.previewItemId !== item.id) return;
    preview.innerHTML = '';
    (place.photos || []).slice(0,3).forEach((photo,index)=>{
      const source = photo.getURI({maxWidth:600,maxHeight:600});
      const credit = (photo.authorAttributions || []).map(author=>author.displayName).filter(Boolean).join(', ');
      const button = document.createElement('button'); button.type='button'; button.className='place-thumb';
      button.innerHTML=`<img src="${safe(source)}" alt="${safe(place.displayName || item.name)} 사진 ${index+1}">`;
      button.addEventListener('click',()=>openLargePhoto(source,place.displayName || item.name,credit)); preview.append(button);
    });
    if (!preview.children.length) preview.innerHTML='<div class="place-preview-empty">제공되는 사진이 없습니다.</div>';
    $("#placeRating").textContent=place.rating ? `★ ${place.rating.toFixed(1)} · ${Number(place.userRatingCount || 0).toLocaleString('ko-KR')}` : 'Google 지도';
    const reviews=[...(place.reviews || [])].filter(review=>review.text).sort((a,b)=>new Date(b.publishTime || 0)-new Date(a.publishTime || 0)).slice(0,3);
    $("#placeReviewSnippet").innerHTML=reviews.length ? '<div class="review-source">Google 제공 리뷰 · 제공된 리뷰 중 최신순</div>'+reviews.map(review=>{
      const author=review.authorAttribution || {};
      const authorName=safe(author.displayName || 'Google 사용자');
      const authorLink=/^https:\/\//.test(author.uri || '') ? `<a href="${safe(author.uri)}" target="_blank" rel="noreferrer">${authorName}</a>` : authorName;
      return `<article class="review-entry"><header><span>${authorLink}</span><span>★ ${safe(review.rating || '')} · ${safe(review.relativePublishTimeDescription || '')}</span></header><details><summary>${safe(review.text)}</summary><p>${safe(review.text)}</p></details></article>`;
    }).join('') : '제공되는 Google 리뷰가 없습니다.';
  } catch(error) {
    if (requestId !== state.placePreviewRequest) return;
    preview.innerHTML='<div class="place-preview-empty">사진을 불러오지 못했습니다.</div>';
    $("#placeReviewSnippet").textContent='리뷰를 불러오지 못했습니다. 잠시 후 다시 선택해 주세요.';
  }
}

async function loadGoogleMaps() {
  if (window.google?.maps?.importLibrary) return;
  await new Promise((resolve, reject) => {
    window.__morrowMapsReady = resolve;
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_KEY}&v=weekly&loading=async&libraries=places,marker&language=ko&region=KR&callback=__morrowMapsReady`;
    script.async = true;
    script.onerror = () => reject(new Error("Google 지도를 불러오지 못했습니다."));
    document.head.append(script);
  });
}
async function initMap() {
  try {
    await loadGoogleMaps();
    const { Map } = await google.maps.importLibrary("maps");
    state.map = new Map($("#googleMap"), {
      center: { lat: 35.0116, lng: 135.7681 }, zoom: 13, mapId: "DEMO_MAP_ID",
      mapTypeControl: false, streetViewControl: false, fullscreenControl: false,
      gestureHandling: "greedy", clickableIcons: true
    });
    state.mapReady = true;
    renderMap();
  } catch (error) {
    $("#googleMap").innerHTML = `<div class="agenda-empty">Google 지도를 불러오지 못했습니다.<br>${safe(error.message)}</div>`;
  }
}
function markerContent(item, selected = false) {
  const node = document.createElement("div");
  node.className = `route-marker ${selected ? "selected" : ""}`;
  node.innerHTML = `<span>${item.icon || "•"}</span>`;
  node.addEventListener("mouseenter", () => previewStop(item.id));
  node.addEventListener("mouseleave", () => previewStop(state.selectedId));
  return node;
}
async function renderMap() {
  if (!state.mapReady) return;
  const requestId=++state.mapRenderRequest;
  const {AdvancedMarkerElement}=await google.maps.importLibrary('marker');
  if(requestId!==state.mapRenderRequest)return;
  state.markers.forEach(marker=>{marker.map=null;});state.markers.clear();
  state.routes.forEach(route=>route.setMap(null));state.routes=[];
  const items=activeItems().filter(itemPosition), allItems=activeItems(true), allPeople=travelers();
  items.forEach(item=>{const marker=new AdvancedMarkerElement({map:state.map,position:itemPosition(item),title:item.name,content:markerContent(item,item.id===state.selectedId),gmpClickable:true});marker.addEventListener('gmp-click',()=>selectStop(item.id,true));state.markers.set(item.id,marker);});
  const colors=['#8060b7','#257da1','#ce7744','#45856e','#bd5981','#807f2c'];
  const people=allPeople.filter(person=>state.travelerFilter==='all'||state.travelerFilter===person.id);
  const routeGroups=new Map();
  people.forEach(person=>{const path=personStops(items,person.id),signature=path.map(item=>item.id).join('|');if(!signature)return;if(!routeGroups.has(signature))routeGroups.set(signature,{path,people:[],color:colors[routeGroups.size%colors.length]});routeGroups.get(signature).people.push(person);});
  routeGroups.forEach(group=>{state.routes.push(new google.maps.Polyline({map:state.map,path:group.path.map(itemPosition),geodesic:true,strokeColor:group.color,strokeOpacity:.7,strokeWeight:3}));});
  $("#routeLegend").innerHTML=[...routeGroups.values()].map(group=>`<span style="--route-color:${group.color}"><i></i>${group.people.map(p=>safe(p.nickname)).join(' · ')}</span>`).join('');
  const selected=selectedItem(), cutoff=selected?.start_time, selectedIndex=allItems.findIndex(item=>item.id===state.selectedId);
  const currentItems=selected ? allItems.filter((item,index)=>cutoff && item.start_time ? item.start_time<=cutoff : index<=selectedIndex) : [];
  const targets=[];
  routeGroups.forEach(group=>group.people.forEach(person=>{const stops=personStops(currentItems,person.id).filter(itemPosition);const item=stops.at(-1)||group.path[0];if(item)targets.push({person,position:itemPosition(item),color:group.color});}));
  const sameDate=state.routeDate===state.activeDate;state.routeDate=state.activeDate;
  const destinationCounts=new Map();targets.forEach(target=>{const key=JSON.stringify(target.position);target.offset=destinationCounts.get(key)||0;destinationCounts.set(key,target.offset+1);});
  const oldIds=new Set(state.travelerMarkers.keys());
  const moves=targets.map(target=>{oldIds.delete(target.person.id);let marker=state.travelerMarkers.get(target.person.id);const content=document.createElement('div');content.className='traveler-map-marker';content.style.setProperty('--route-color',target.color);content.style.marginLeft=`${target.offset*22}px`;content.innerHTML=faceHtml(target.person);const old=marker?.position;const from=old && sameDate ? {lat:typeof old.lat==='function'?old.lat():old.lat,lng:typeof old.lng==='function'?old.lng():old.lng}:target.position;
    if(!marker){marker=new AdvancedMarkerElement({map:state.map,position:from,content,title:target.person.nickname,zIndex:100+target.offset});state.travelerMarkers.set(target.person.id,marker);}else{marker.content=content;marker.title=target.person.nickname;marker.map=state.map;}
    return {marker,from,to:target.position};
  });
  oldIds.forEach(id=>{state.travelerMarkers.get(id).map=null;state.travelerMarkers.delete(id);});
  cancelAnimationFrame(state.routeAnimation);
  const duration=sameDate && !matchMedia('(prefers-reduced-motion: reduce)').matches ? 850:0,start=performance.now();
  const animate=now=>{const fraction=duration?Math.min(1,(now-start)/duration):1,eased=fraction*fraction*(3-2*fraction);moves.forEach(({marker,from,to})=>{marker.position={lat:from.lat+(to.lat-from.lat)*eased,lng:from.lng+(to.lng-from.lng)*eased};});if(fraction<1)state.routeAnimation=requestAnimationFrame(animate);};state.routeAnimation=requestAnimationFrame(animate);
  if(selected&&itemPosition(selected))panMapToItem(selected,false);else fitActiveBounds(items);
}
function fitActiveBounds(items = activeItems().filter(itemPosition)) {
  if (!state.mapReady || !items.length) return;
  if (items.length === 1) {
    state.map.setCenter(itemPosition(items[0]));
    state.map.setZoom(14);
    return;
  }
  const bounds = new google.maps.LatLngBounds();
  items.forEach(item => bounds.extend(itemPosition(item)));
  state.map.fitBounds(bounds, 80);
}
async function panMapToItem(item, animate = true) {
  if (!state.mapReady) return;
  const position = itemPosition(item);
  if (!position) return;
  const center = state.map.getCenter();
  const far = center && Math.hypot(center.lat() - position.lat, center.lng() - position.lng) > .45;
  if (animate && far) {
    state.map.setZoom(Math.min(state.map.getZoom() || 12, 7));
    await sleep(300);
  }
  state.map.panTo(position);
  if (animate) await sleep(far ? 650 : 320);
  if ((state.map.getZoom() || 0) < 14) state.map.setZoom(14);
}
function previewStop(id) {
  const item = state.items.find(value => value.id === id);
  if (!item) {
    updatePlaceCard(null);
    state.markers.forEach(marker => marker.content?.classList.remove("selected"));
    fitActiveBounds();
    return;
  }
  updatePlaceCard(item);
  state.markers.forEach((marker, markerId) => {
    marker.content?.classList.toggle("selected", markerId === id);
  });
  if (state.mapReady && itemPosition(item)) state.map.panTo(itemPosition(item));
}
function selectStop(id, animate = false) {
  state.selectedId = id;
  render();
  const item = selectedItem();
  if (item) panMapToItem(item, animate);
}

function fillTimeOptions() {
  $("#iconCategory").innerHTML = iconGroups.map(group => `<option value="${safe(group.name)}">${safe(group.name)}</option>`).join("");
}
function setTimeFields(prefix, value = "") { $(`#${prefix}Time`).value = value ? String(value).slice(0,5) : ""; }
function readTimeFields(prefix) {return $(`#${prefix}Time`).value;}
function toggleEndTime(show) {
  $("#endTimeFields").hidden = !show;
  $("#toggleEndTime").checked = show;
  $("#endTime").disabled = !show;
  if (!show) $("#endTime").value = "";
}
function toggleSettlement(show) {
  $("#settlementEnabled").checked = show; $("#costFields").hidden = !show; $("#settlementUnset").hidden = show;
  $("#scheduleForm").elements.cost.disabled = !show; $("#splitType").disabled = !show;
  $("#ratioFields").hidden = !show || $("#splitType").value !== 'custom';
  $$("input",$("#ratioFields")).forEach(input=>input.disabled=!show || $("#splitType").value !== 'custom');
}
function updateIconButton(){const value=$("#selectedIcon").value;$("#openIconPicker").textContent=value || '＋';$("#openIconPicker").classList.toggle('has-icon',Boolean(value));$("#openIconPicker").setAttribute('aria-label',value ? '아이콘 변경' : '아이콘 추가');}
function renderIcons(query = "") {
  const keyword = query.trim().toLowerCase();
  const category = $("#iconCategory").value || "추천";
  const matches = icons.filter(icon => keyword ? icon.keywords.toLowerCase().includes(keyword) || icon.value.includes(keyword) : icon.group === category);
  $("#iconResultCount").textContent = keyword ? `전체 카테고리에서 ${matches.length}개 찾음` : `${category} · ${matches.length}개`;
  $("#iconGrid").innerHTML = matches.length ? matches.map(icon => `<button class="icon-option" type="button" data-icon="${icon.value}" aria-label="${icon.value || "기본 점"}" aria-pressed="${$("#selectedIcon").value === icon.value}">${icon.value || "•"}</button>`).join("") : `<p class="icon-empty">관련 아이콘이 없습니다. 다른 단어로 검색해 보세요.</p>`;
  $$("[data-icon]").forEach(button => button.addEventListener("click", () => {
    $("#selectedIcon").value = button.dataset.icon;
    updateIconButton(); $("#iconDialog").close();
  }));
}
function renderCategories() {
  const categories=state.trip.categories || ['음식','관광','이동','쇼핑'];
  const previous=$("#categorySelect").value;
  if (!categories.includes(previous)) $("#categorySelect").value='';
  $("#categoryValue").textContent=$("#categorySelect").value || '선택 안 함';
  $("#categoryOptions").innerHTML=['',...categories].map(category=>`<button type="button" data-category="${safe(category)}">${safe(category || '선택 안 함')}</button>`).join('');
  $$('[data-category]').forEach(button=>button.addEventListener('click',()=>{ $("#categorySelect").value=button.dataset.category;$("#categoryValue").textContent=button.dataset.category || '선택 안 함';closeCategoryMenu();}));
  $("#categoryChips").innerHTML=categories.map(category=>`<button class="category-chip" type="button" data-delete-category="${safe(category)}" aria-label="${safe(category)} 삭제">${safe(category)} <span>×</span></button>`).join('');
  $$('[data-delete-category]').forEach(button=>button.addEventListener('click',()=>removeCategory(button.dataset.deleteCategory)));
}
function closeCategoryMenu(){ $("#categoryMenu").hidden=true;$("#categoryDropdown").setAttribute('aria-expanded','false'); }
function renderRatioFields(ratios = {}) {
  const people=attendeesFor({participant_ids:state.participantIds},travelers());
  const base=Math.floor(1000/Math.max(1,people.length))/10;
  $("#ratioFields").innerHTML=people.map((person,index)=>`<label>${safe(person.nickname)} %<input name="ratio_${safe(person.id)}" type="number" min="0" max="100" step="0.1" value="${ratios[person.id] ?? (index===people.length-1 ? Math.round((100-base*(people.length-1))*10)/10 : base)}"></label>`).join('');
}
function resetScheduleForm(item = null) {
  const form = $("#scheduleForm");
  form.reset();
  state.placeResolveRequest++; state.editorMapRequest++; clearTimeout(placeSearchTimer);
  state.pendingPlace = null; state.participantIds = item?.participant_ids ?? null;
  $("#editorMapWrap").hidden = true; closeCategoryMenu();
  form.elements.itemId.value = item?.id || "";
  form.elements.date.min = state.trip.start_date;
  form.elements.date.max = state.trip.end_date;
  form.elements.date.value = item?.item_date || state.activeDate;
  setTimeFields("start", item?.start_time || "");
  setTimeFields("end", item?.end_time || "");
  toggleEndTime(Boolean(item?.end_time));
  form.elements.mapsUrl.value = item?.maps_url || "";
  $("#placeSearchInput").value = item?.maps_url ? item.name : "";
  $("#placeSearchInput").setAttribute("aria-expanded", "false");
  $("#placeSearchResults").hidden = true;
  $("#placeSearchResults").innerHTML = "";
  $("#clearPlaceButton").hidden = !item?.place_id;
  if (item?.maps_url) {
    state.pendingPlace = {
      sourceQuery: item.name, placeId: item.place_id, name: item.name,
      address: "", mapsUrl: item.maps_url || "",
      latitude: item.latitude == null ? null : Number(item.latitude), longitude: item.longitude == null ? null : Number(item.longitude)
    };
  }
  form.elements.name.value = item?.name || "";
  form.elements.name.dataset.autoFilled = item ? "false" : "true";
  form.elements.memo.value = item?.memo || "";
  form.elements.cost.value = item?.cost_won || "";
  $("#selectedIcon").value = item?.icon || "";
  $("#iconSearch").value = "";
  $("#iconCategory").value = "추천";
  const custom = item && Object.keys(item.split_ratios || {}).length > 0;
  form.elements.splitType.value = custom ? "custom" : "equal";
  $("#ratioFields").hidden = !custom;
  renderRatioFields(item?.split_ratios || {});
  toggleSettlement(Boolean(item?.settlement_enabled));
  renderAttendeeSummary(); $("#memoSummary").textContent=item?.memo || "＋ 세부 메모 추가"; updateIconButton();
  renderCategories();
  form.elements.category.value = item?.category || ""; $("#categoryValue").textContent=item?.category || "선택 안 함";
  renderIcons();
  $("#mapsLinkStatus").className = "field-hint";
  $("#mapsLinkStatus").textContent = item?.place_id ? "선택된 Google 장소입니다." : "장소 없이도 일정을 저장할 수 있습니다.";
  $("#formError").textContent = "";
  $("#scheduleModeLabel").textContent = item ? "EDIT MOMENT" : "NEW MOMENT";
  $("#scheduleDialogTitle").textContent = item ? "일정 다듬기" : "새 일정 추가";
  $("#editorContext").textContent = `${state.trip.title} · ${formatDate(item?.item_date || state.activeDate)}`;
  $("#saveScheduleButton").textContent = item ? "변경 저장" : "일정 추가";
  $("#deleteScheduleButton").hidden = !item;
}
function openSchedule(item = null) {
  if (!state.session) {
    $("#accountDialog").showModal();
    showToast("일정을 저장하려면 Google 로그인이 필요합니다.");
    return;
  }
  if (!state.trip.id) {
    openTripManager(true);
    showToast("먼저 여행을 만들어 주세요.");
    return;
  }
  if (!canEdit()) {
    showToast("이 여행은 열람만 가능합니다.");
    return;
  }
  resetScheduleForm(item);
  $("#scheduleDialog").showModal();
  $("#scheduleDialog").scrollTop=0;
  if(state.pendingPlace) renderEditorMap(state.pendingPlace);
}

async function findGooglePlaces(query, bias = null) {
  if (!state.mapReady) await initMap();
  const { Place } = await google.maps.importLibrary("places");
  const request = {
    textQuery: query,
    fields: ["id", "displayName", "formattedAddress", "location", "googleMapsURI"],
    language: "ko", maxResultCount: 5
  };
  const center = state.map?.getCenter?.();
  if (bias || center) request.locationBias = bias || center;
  const { places } = await Place.searchByText(request);
  return places || [];
}
function clearPlaceSelection(clearQuery = true) {
  state.placeResolveRequest++; state.editorMapRequest++; clearTimeout(placeSearchTimer);
  $("#editorMapWrap").hidden = true;
  state.pendingPlace = null;
  $("#mapsUrlInput").value = "";
  if (clearQuery) $("#placeSearchInput").value = "";
  $("#placeSearchResults").hidden = true;
  $("#placeSearchResults").innerHTML = "";
  $("#placeSearchInput").setAttribute("aria-expanded", "false");
  $("#clearPlaceButton").hidden = true;
  $("#mapsLinkStatus").className = "field-hint";
  $("#mapsLinkStatus").textContent = "장소 없이도 일정을 저장할 수 있습니다.";
}
function selectGooglePlace(place) {
  if (!place?.location) return;
  const nameInput = $("#scheduleForm").elements.name;
  state.pendingPlace = {
    sourceQuery: $("#placeSearchInput").value, placeId: place.id, name: place.displayName,
    address: place.formattedAddress, mapsUrl: place.googleMapsURI || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.displayName)}&query_place_id=${encodeURIComponent(place.id)}`,
    latitude: place.location.lat(), longitude: place.location.lng()
  };
  $("#placeSearchInput").value = place.displayName;
  $("#mapsUrlInput").value = state.pendingPlace.mapsUrl;
  $("#placeSearchResults").hidden = true;
  $("#placeSearchInput").setAttribute("aria-expanded", "false");
  $("#clearPlaceButton").hidden = false;
  if (!nameInput.value || nameInput.dataset.autoFilled === "true") {
    nameInput.value = place.displayName;
    nameInput.dataset.autoFilled = "true";
  }
  const status = $("#mapsLinkStatus");
  status.textContent = `${place.displayName}${place.formattedAddress ? ` · ${place.formattedAddress}` : ""}`;
  status.className = "field-hint is-success";
  renderEditorMap(state.pendingPlace);
}
async function searchGooglePlaces(rawQuery) {
  const query = String(rawQuery || "").trim();
  const status = $("#mapsLinkStatus");
  const results = $("#placeSearchResults");
  const requestId = ++state.placeResolveRequest;
  if (query.length < 2) {
    results.hidden = true;
    $("#placeSearchInput").setAttribute("aria-expanded", "false");
    status.textContent = query ? "두 글자 이상 입력해 주세요." : "장소 없이도 일정을 저장할 수 있습니다.";
    status.className = "field-hint";
    return;
  }
  status.textContent = "Google 지도에서 장소를 찾는 중입니다…";
  status.className = "field-hint is-loading";
  try {
    if (/^https?:\/\//i.test(query)) {
      await resolvePastedMapsLink(query, requestId); return;
    }
    const places = await findGooglePlaces(query);
    if (requestId !== state.placeResolveRequest || $("#placeSearchInput").value.trim() !== query) return;
    results.innerHTML = places.length ? places.map((place, index) => `<button type="button" role="option" data-place-index="${index}"><strong>${safe(place.displayName)}</strong><small>${safe(place.formattedAddress || "주소 정보 없음")}</small></button>`).join("") : `<p>검색 결과가 없습니다.</p>`;
    results.hidden = false;
    $("#placeSearchInput").setAttribute("aria-expanded", "true");
    $$('[data-place-index]', results).forEach(button => button.addEventListener("click", () => selectGooglePlace(places[Number(button.dataset.placeIndex)])));
    status.textContent = places.length ? "검색 결과에서 장소를 선택해 주세요." : "다른 검색어로 다시 찾아보세요.";
    status.className = places.length ? "field-hint" : "field-hint is-warning";
  } catch (error) {
    if (requestId !== state.placeResolveRequest) return;
    results.hidden = true;
    $("#placeSearchInput").setAttribute("aria-expanded", "false");
    status.textContent = error.message || "장소를 확인하지 못했습니다.";
    status.className = "field-hint is-warning";
  }
}

async function saveSchedule(event) {
  event.preventDefault();
  if (!state.session || !canEdit()) return;
  const form = event.currentTarget;
  const data = new FormData(form);
  const startTime = readTimeFields("start");
  const endTime = $("#endTimeFields").hidden ? "" : readTimeFields("end");
  const placeQuery = $("#placeSearchInput").value.trim();
  const errorNode = $("#formError");
  errorNode.textContent = "";
  if (placeQuery && !state.pendingPlace) {
    errorNode.textContent = "검색 결과에서 장소를 선택하거나 검색어를 비워 주세요.";
    return;
  }
  if ($("#toggleEndTime").checked && (!startTime || !endTime)) { errorNode.textContent="시작 시간과 종료 시간을 모두 선택해 주세요."; return; }
  if (endTime && endTime <= startTime) {
    errorNode.textContent = "종료 시간을 시작 시간 이후로 선택해 주세요.";
    return;
  }
  const place = state.pendingPlace;
  let splitRatios = {};
  const settlementEnabled = $("#settlementEnabled").checked;
  if (settlementEnabled && data.get("splitType") === "custom") {
    attendeesFor({participant_ids:state.participantIds},travelers()).forEach(person => { splitRatios[person.id] = Number(data.get(`ratio_${person.id}`) || 0); });
    const sum = Object.values(splitRatios).reduce((total, value) => total + value, 0);
    if (Math.abs(sum - 100) > .05) {
      errorNode.textContent = "구성원의 배분율 합계를 100%로 맞춰 주세요.";
      return;
    }
  }
  const row = {
    trip_id: state.trip.id, item_date: data.get("date"), start_time: startTime || null, end_time: endTime || null,
    icon: data.get("icon") || "", name: String(data.get("name") || "").trim(), maps_url: place?.mapsUrl || null,
    place_id: place?.placeId || null, latitude: place?.latitude ?? null, longitude: place?.longitude ?? null,
    category: data.get("category") || null, memo: data.get("memo") || null,
    cost_won: settlementEnabled ? Number(data.get("cost") || 0) : 0, settlement_enabled: settlementEnabled, participant_ids: state.participantIds, split_ratios: splitRatios, created_by: state.session.user.id
  };
  if (!row.name) {errorNode.textContent="일정 이름을 입력해 주세요.";return;}
  const itemId = String(data.get("itemId") || "");
  const query = itemId ? supabase.from("mt_itinerary_items").update(row).eq("id", itemId) : supabase.from("mt_itinerary_items").insert(row).select().single();
  const { data: saved, error } = await query;
  if (error) {
    errorNode.textContent = error.message;
    return;
  }
  $("#scheduleDialog").close();
  await loadTripData(state.trip.id);
  state.activeDate = row.item_date;
  state.selectedId = itemId || saved.id;
  render();
  showToast(itemId ? "일정을 수정했습니다." : "새 일정을 추가했습니다.");
}
async function deleteSchedule(idOverride = null) {
  const id = typeof idOverride === "string" ? idOverride : $("#scheduleForm").elements.itemId.value;
  if (!id || !confirm("이 일정을 삭제할까요?")) return;
  const { error } = await supabase.from("mt_itinerary_items").delete().eq("id", id);
  if (error) return showToast(error.message);
  if ($("#scheduleDialog").open) $("#scheduleDialog").close();
  state.selectedId = null;
  await loadTripData(state.trip.id);
  render();
  showToast("일정을 삭제했습니다.");
}
async function addCategory() {
  const input = $("#newCategory");
  const category = input.value.trim();
  if (!category || state.trip.categories.includes(category)) return;
  if (state.trip.owner_id !== state.session?.user.id) return showToast("카테고리는 여행 소유자만 관리할 수 있습니다.");
  const categories = [...state.trip.categories, category];
  const { error } = await supabase.from("mt_trips").update({ categories }).eq("id", state.trip.id);
  if (error) return showToast(error.message);
  state.trip.categories = categories;
  input.value = "";
  renderCategories();
}
async function removeCategory(category) {
  if (state.trip.owner_id !== state.session?.user.id) return showToast("카테고리는 여행 소유자만 관리할 수 있습니다.");
  if (state.trip.categories.length <= 1) return showToast("카테고리는 하나 이상 남겨 주세요.");
  const categories = state.trip.categories.filter(value => value !== category);
  const { error } = await supabase.from("mt_trips").update({ categories }).eq("id", state.trip.id);
  if (error) return showToast(error.message);
  state.trip.categories = categories;
  renderCategories();
}

async function getPlaceDetails(item) {
  const cacheKey = item.place_id || item.id;
  if (state.placeCache.has(cacheKey)) return state.placeCache.get(cacheKey);
  await loadGoogleMaps();
  const { Place } = await google.maps.importLibrary("places");
  let place;
  if (item.place_id) {
    place = new Place({ id: item.place_id });
    await place.fetchFields({ fields: ["displayName", "formattedAddress", "location", "googleMapsURI", "rating", "userRatingCount", "photos", "reviews"] });
  } else {
    const result = await Place.searchByText({
      textQuery: `${item.name} ${state.trip.destination}`,
      fields: ["id", "displayName", "formattedAddress", "location", "googleMapsURI", "rating", "userRatingCount", "photos", "reviews"],
      language: "ko", maxResultCount: 1, locationBias: itemPosition(item) || undefined
    });
    place = result.places?.[0];
  }
  if (!place) throw new Error("Google에서 장소 정보를 찾지 못했습니다.");
  state.placeCache.set(cacheKey, place);
  return place;
}
function openLargePhoto(source, alt, credit) {
  $("#largePhoto").src = source;
  $("#largePhoto").alt = alt;
  $("#largePhotoCredit").textContent = credit ? `사진 제공: ${credit} · Google Maps` : "Google Maps 사진";
  $("#imageDialog").showModal();
}

function renderReceipt() {
  const people=travelers(), costItems=state.items.filter(item=>item.settlement_enabled && Number(item.cost_won)>0);
  const shares=Object.fromEntries(people.map(person=>[person.id,0]));
  costItems.forEach(item=>Object.entries(allocateCost(item,people)).forEach(([id,amount])=>{shares[id]=(shares[id] || 0)+amount;}));
  const total=costItems.reduce((sum,item)=>sum+Number(item.cost_won),0);
  $("#receiptContent").innerHTML=`<div class="receipt-head"><strong>TRIP RECEIPT</strong><span>${safe(state.trip.title)} · ${safe(state.trip.start_date)} — ${safe(state.trip.end_date)}</span></div>${costItems.length ? costItems.map(item=>`<div class="receipt-line"><span>${safe(item.name)}<small class="receipt-attendees">${attendeesFor(item,people).map(p=>safe(p.nickname)).join(' · ')}</small></span><span>${won(item.cost_won)}</span></div>`).join('') : '<div class="receipt-line"><span>정산할 내역이 없습니다.</span><span>₩0</span></div>'}<div class="receipt-line receipt-total-line"><strong>TOTAL</strong><strong>${won(total)}</strong></div><div class="receipt-members">${people.map(person=>`<div class="receipt-line"><span>${faceHtml(person)} ${safe(person.nickname)}</span><strong>${won(shares[person.id])}</strong></div>`).join('')}</div><div class="receipt-barcode" aria-hidden="true"></div>`;
}

async function joinInvitedTrip(tripId, inviteCode) {
  if (!tripId || !inviteCode) return false;
  const { error } = await supabase.from("mt_trip_members").insert({
    trip_id: tripId, user_id: state.session.user.id, role: "editor", invite_code_used: inviteCode
  });
  if (error && error.code !== "23505") throw error;
  return true;
}
async function loadTripData(tripId) {
  const tripResult = await supabase.from("mt_trips").select("*").eq("id", tripId).single();
  if (tripResult.error) throw tripResult.error;
  state.trip = tripResult.data;
  const [itemsResult, membersResult] = await Promise.all([
    supabase.from("mt_itinerary_items").select("*").eq("trip_id", tripId).order("item_date").order("start_time").order("sort_order"),
    supabase.from("mt_trip_members").select("user_id, role, joined_at").eq("trip_id", tripId).order("joined_at")
  ]);
  if (itemsResult.error) throw itemsResult.error;
  if (membersResult.error) throw membersResult.error;
  const ids = membersResult.data.map(member => member.user_id);
  const profilesResult = ids.length ? await supabase.from("mt_profiles").select("id, display_name, avatar_url").in("id", ids) : { data: [], error: null };
  const profiles = new Map((profilesResult.data || []).map(profile => [profile.id, profile]));
  state.members = membersResult.data.map(member => ({
    ...member, ...(profiles.get(member.user_id) || {}),
    display_name: profiles.get(member.user_id)?.display_name || (member.user_id === state.session.user.id ? state.session.user.user_metadata?.full_name || state.session.user.email?.split("@")[0] : "여행자"),
    avatar_url: profiles.get(member.user_id)?.avatar_url || (member.user_id === state.session.user.id ? state.session.user.user_metadata?.avatar_url : "")
  }));
  state.items = itemsResult.data || [];
}
async function loadTripList() {
  const [tripsResult, membershipResult] = await Promise.all([
    supabase.from("mt_trips").select("*").order("updated_at", { ascending: false }),
    supabase.from("mt_trip_members").select("trip_id, role").eq("user_id", state.session.user.id)
  ]);
  if (tripsResult.error) throw tripsResult.error;
  if (membershipResult.error) throw membershipResult.error;
  const roles = new Map((membershipResult.data || []).map(member => [member.trip_id, member.role]));
  state.trips = (tripsResult.data || []).map(trip => ({
    ...trip,
    _role: trip.owner_id === state.session.user.id ? "owner" : roles.get(trip.id) || "viewer"
  }));
  return state.trips;
}
function setEmptyWorkspace() {
  state.trip = blankTrip();
  state.members = []; state.travelerFilter = "all";
  state.items = [];
  state.activeDate = state.trip.start_date;
  state.selectedId = null;
  if (state.realtimeChannel) {
    supabase.removeChannel(state.realtimeChannel);
    state.realtimeChannel = null;
  }
}
function clearShareParameters() {
  const url = new URL(location.href);
  if (!url.searchParams.has("trip") && !url.searchParams.has("invite")) return;
  url.searchParams.delete("trip");
  url.searchParams.delete("invite");
  history.replaceState({}, "", url);
}
async function switchTrip(tripId, options = {}) {
  if (!tripId || !state.session) return;
  setSync("여행을 불러오는 중");
  await loadTripData(tripId);
  state.activeDate = state.trip.start_date;
  state.selectedId = null; state.travelerFilter = "all";
  state.placePreviewRequest += 1;
  localStorage.setItem(`morrow-active-trip-${state.session.user.id}`, tripId);
  if (options.clearShareUrl !== false) clearShareParameters();
  subscribeRealtime();
  setSync("실시간 저장됨");
  render();
}
async function loadCloudWorkspace() {
  setSync("저장된 여행을 불러오는 중");
  const params = new URLSearchParams(location.search);
  const invitedTrip = params.get("trip");
  const inviteCode = params.get("invite");
  if (invitedTrip && inviteCode) {
    await joinInvitedTrip(invitedTrip, inviteCode);
    await loadTripList();
    await loadTripData(invitedTrip);
    showToast("초대받은 여행에 참여했습니다.");
  } else {
    await loadTripList();
    const preferredId = localStorage.getItem(`morrow-active-trip-${state.session.user.id}`);
    const trip = state.trips.find(value => value.id === preferredId) || state.trips[0];
    if (!trip) {
      setEmptyWorkspace();
      setSync("새 여행을 만들어 주세요");
      render();
      return;
    }
    await loadTripData(trip.id);
  }
  state.activeDate = dateRange(state.trip.start_date, state.trip.end_date).includes(state.activeDate) ? state.activeDate : state.trip.start_date;
  state.selectedId = null;
  subscribeRealtime();
  setSync("실시간 저장됨");
  render();
}
function subscribeRealtime() {
  if (state.realtimeChannel) supabase.removeChannel(state.realtimeChannel);
  if (!state.trip.id) {
    state.realtimeChannel = null;
    return;
  }
  state.realtimeChannel = supabase.channel(`morrow-${state.trip.id}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "mt_itinerary_items", filter: `trip_id=eq.${state.trip.id}` }, scheduleReload)
    .on("postgres_changes", { event: "*", schema: "public", table: "mt_trip_members", filter: `trip_id=eq.${state.trip.id}` }, scheduleReload)
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "mt_trips", filter: `id=eq.${state.trip.id}` }, scheduleReload)
    .subscribe(status => { if (status === "SUBSCRIBED") setSync("친구들과 실시간 연결됨"); });
}
function scheduleReload() {
  clearTimeout(state.reloadTimer);
  state.reloadTimer = setTimeout(async () => {
    try {
      const tripId = state.trip.id;
      if (!tripId) return;
      await loadTripData(tripId);
      await loadTripList();
      render();
      setSync("방금 동기화됨");
    } catch (error) {
      setSync("동기화 확인 필요");
    }
  }, 250);
}
function renderTripList() {
  const list = $("#tripList");
  if (!state.trips.length) {
    list.innerHTML = `<div class="trip-list-empty">아직 만든 여행이 없습니다.<br>첫 여행을 만들어 보세요.</div>`;
    return;
  }
  list.innerHTML = state.trips.map(trip => {
    const role = trip._role === "owner" ? "소유자" : trip._role === "editor" ? "편집 가능" : "열람만";
    return `<div class="trip-list-item ${trip.id === state.trip.id ? "is-active" : ""}"><button type="button" class="trip-list-main" data-trip-id="${safe(trip.id)}"><span><strong>${safe(trip.title)}</strong><small>${safe(trip.destination || "여행지 미정")} · ${safe(trip.start_date)} — ${safe(trip.end_date)}</small></span><em>${role}</em></button><button type="button" class="trip-share-button" data-share-trip="${safe(trip.id)}" aria-label="${safe(trip.title)} 링크 공유 설정">🔗 링크</button></div>`;
  }).join("");
  $$("[data-trip-id]", list).forEach(button => button.addEventListener("click", async () => {
    if (button.dataset.tripId !== state.trip.id) await switchTrip(button.dataset.tripId);
    renderTripList();
    resetTripForm(state.trips.find(trip => trip.id === button.dataset.tripId) || state.trip);
  }));
  $$("[data-share-trip]", list).forEach(button => button.addEventListener("click", async () => {
    try {
      if (button.dataset.shareTrip !== state.trip.id) await switchTrip(button.dataset.shareTrip);
      $("#tripDialog").close();
      openNamedDialog("inviteDialog");
    } catch (error) {
      showToast(error.message || "공유 설정을 열지 못했습니다.");
    }
  }));
}
function resetTripForm(trip = null) {
  const form = $("#tripForm");
  form.reset();
  const isExisting = Boolean(trip?.id);
  const role = isExisting ? (trip._role || currentRole(trip)) : "owner";
  const editable = !isExisting || role === "owner";
  form.elements.tripId.value = trip?.id || "";
  form.elements.title.value = trip?.title || "";
  form.elements.destination.value = trip?.destination || "";
  form.elements.startDate.value = trip?.start_date || todayString();
  form.elements.endDate.value = trip?.end_date || todayString();
  [form.elements.title, form.elements.destination, form.elements.startDate, form.elements.endDate].forEach(input => { input.disabled = !editable; });
  $("#tripFormTitle").textContent = isExisting ? "여행 정보" : "새 여행 만들기";
  $("#tripFormRole").textContent = !isExisting ? "일정 없이 시작합니다" : role === "owner" ? "제목과 기간을 수정할 수 있습니다" : role === "editor" ? "이 여행을 함께 편집 중입니다" : "이 여행을 열람할 수 있습니다";
  $("#saveTripButton").hidden = !editable;
  $("#deleteTripButton").hidden = !isExisting || role !== "owner";
  $("#tripFormError").textContent = "";
  state.draftTravelers = isExisting ? travelersFor(trip,state.members).map(person=>({...person})) : [{id:state.session.user.id,nickname:state.session.user.user_metadata?.full_name || "나",avatar:"male-001"}];
  state.rosterEditable=editable; renderDraftTravelers();
}
function openTripManager(createNew = false) {
  if (!state.session) {
    $("#accountDialog").showModal();
    showToast("여행을 관리하려면 Google 로그인이 필요합니다.");
    return;
  }
  renderTripList();
  resetTripForm(createNew || !state.trip.id ? null : state.trips.find(trip => trip.id === state.trip.id) || state.trip);
  if (!$("#tripDialog").open) $("#tripDialog").showModal();
}
async function saveTrip(event) {
  event.preventDefault();
  if (!state.session) return;
  const form = event.currentTarget;
  const data = new FormData(form);
  const tripId = String(data.get("tripId") || "");
  const title = String(data.get("title") || "").trim();
  const destination = String(data.get("destination") || "").trim();
  const startDate = String(data.get("startDate") || "");
  const endDate = String(data.get("endDate") || "");
  const errorNode = $("#tripFormError");
  const roster=state.draftTravelers.map(person=>({...person,nickname:person.nickname.trim()}));
  if (!roster.length || roster.some(person=>!person.nickname)) {errorNode.textContent="여행 인원의 닉네임을 모두 입력해 주세요.";return;}
  errorNode.textContent = "";
  if (!title) return void (errorNode.textContent = "여행 제목을 입력해 주세요.");
  if (!startDate || !endDate || endDate < startDate) return void (errorNode.textContent = "종료일은 시작일과 같거나 이후여야 합니다.");
  if (tripId) {
    if (state.trip.id !== tripId || state.trip.owner_id !== state.session.user.id) return void (errorNode.textContent = "여행 소유자만 정보를 수정할 수 있습니다.");
    const datesChanged = startDate !== state.trip.start_date || endDate !== state.trip.end_date;
    const oldDayCount = dateRange(state.trip.start_date, state.trip.end_date).length;
    const newDayCount = dateRange(startDate, endDate).length;
    const deleteItems = datesChanged && oldDayCount !== newDayCount && state.items.length > 0;
    if (deleteItems && !confirm(`여행 일수가 ${oldDayCount}일에서 ${newDayCount}일로 바뀝니다. 기존 일정 ${state.items.length}개가 모두 삭제됩니다. 계속할까요?`)) return;
    const { error } = await supabase.rpc("mt_save_trip_settings", {
      p_trip_id: tripId,
      p_title: title,
      p_destination: destination,
      p_start_date: startDate,
      p_end_date: endDate,
      p_delete_items: deleteItems, p_travelers: roster
    });
    if (error) return void (errorNode.textContent = error.message);
    await loadTripList();
    await switchTrip(tripId);
    $("#tripDialog").close();
    showToast(deleteItems ? "여행 기간을 바꾸고 기존 일정을 삭제했습니다." : datesChanged && state.items.length ? "여행 일차에 맞춰 일정을 함께 옮겼습니다." : "여행 정보를 저장했습니다.");
    return;
  }
  const { data: trip, error } = await supabase.from("mt_trips").insert({
    owner_id: state.session.user.id,
    title,
    destination,
    start_date: startDate,
    end_date: endDate,
    categories: ["음식", "관광", "이동", "쇼핑"], travelers: roster
  }).select().single();
  if (error) return void (errorNode.textContent = error.message);
  const memberResult = await supabase.from("mt_trip_members").insert({ trip_id: trip.id, user_id: state.session.user.id, role: "owner" });
  if (memberResult.error) return void (errorNode.textContent = memberResult.error.message);
  await loadTripList();
  await switchTrip(trip.id);
  $("#tripDialog").close();
  showToast("빈 여행을 만들었습니다. 첫 일정을 추가해 보세요.");
}
async function deleteTrip() {
  const tripId = $("#tripForm").elements.tripId.value;
  if (!tripId || state.trip.id !== tripId || state.trip.owner_id !== state.session?.user.id) return;
  if (!confirm(`‘${state.trip.title}’ 여행과 모든 일정을 삭제할까요?`)) return;
  const { error } = await supabase.from("mt_trips").delete().eq("id", tripId);
  if (error) return showToast(error.message);
  localStorage.removeItem(`morrow-active-trip-${state.session.user.id}`);
  await loadTripList();
  const nextTrip = state.trips[0];
  if (nextTrip) await switchTrip(nextTrip.id);
  else {
    setEmptyWorkspace();
    setSync("새 여행을 만들어 주세요");
    render();
  }
  $("#tripDialog").close();
  showToast("여행을 삭제했습니다.");
}
async function updateMemberRole(userId, role) {
  const { error } = await supabase.from("mt_trip_members").update({ role }).eq("trip_id", state.trip.id).eq("user_id", userId);
  if (error) return showToast(error.message);
  await loadTripData(state.trip.id);
  render();
  showToast("구성원 권한을 변경했습니다.");
}
function updateAccountUI() {
  const user = state.session?.user;
  const name = user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split("@")[0];
  $("#profileLabel").textContent = user ? user.email : "Google 로그인";
  $("#accountTitle").textContent = user ? `${name}님의 여행` : "여행을 함께 기록하세요";
  $("#accountDescription").textContent = user ? `${user.email} 계정으로 일정이 실시간 저장됩니다.` : "Google 계정으로 로그인하면 일정이 저장되고 친구와 실시간으로 함께 편집할 수 있습니다.";
  $("#googleSignIn").hidden = Boolean(user);
  $("#signOutButton").hidden = !user;
  $("#inviteDescription").textContent = "링크가 있으면 로그인 없이 전체 일정을 볼 수 있습니다. 수정 버튼을 누르면 Google 로그인을 안내합니다.";
  const params = new URLSearchParams(location.search);
  $("#copyInvite").disabled = !(state.trip.share_code || (params.get("trip") && params.get("invite")));
  updateAutoSaveStatus();
}

function scrollToCurrentScheduleOnMobile() {
  if (!matchMedia("(max-width: 850px)").matches) return;
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  if (!dateRange(state.trip.start_date, state.trip.end_date).includes(today)) return;
  state.activeDate = today;
  const clock = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const items = activeItems();
  state.selectedId = [...items].reverse().find(item => formatTime(item.start_time) <= clock)?.id || items[0]?.id || null;
  render();
  requestAnimationFrame(() => $(".agenda-item.is-current, .agenda-item.is-selected")?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" }));
}

async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: location.href, queryParams: { access_type: "offline", prompt: "consent" } }
  });
  if (error) showToast(error.message);
}
async function signOut() {
  await supabase.auth.signOut();
  state.session = null;
  state.trips = [];
  setEmptyWorkspace();
  $("#accountDialog").close();
  const shared = await loadPublicSharedTrip().catch(() => false);
  if (!shared) {
    setSync("Google 로그인 후 여행을 만들 수 있습니다");
    render();
  }
}
async function copyInvite() {
  const params = new URLSearchParams(location.search);
  const tripId = state.trip.share_code ? state.trip.id : params.get("trip");
  const inviteCode = state.trip.share_code || params.get("invite");
  if (!tripId || !inviteCode) return showToast("로그인 후 여행을 저장하면 공유 링크를 만들 수 있습니다.");
  const url = new URL(location.origin + location.pathname);
  url.searchParams.set("trip", tripId);
  url.searchParams.set("invite", inviteCode);
  try {
    await navigator.clipboard.writeText(url.href);
    $("#copyStatus").textContent = "공개 열람 링크를 복사했습니다.";
  } catch {
    $("#copyStatus").textContent = url.href;
  }
}
async function loadPublicSharedTrip() {
  const params = new URLSearchParams(location.search);
  const tripId = params.get("trip");
  const inviteCode = params.get("invite");
  if (!tripId || !inviteCode) return false;
  const { data, error } = await supabase.rpc("mt_get_shared_trip", { p_trip_id: tripId, p_share_code: inviteCode });
  if (error) throw error;
  if (!data?.trip) throw new Error("공유 링크가 유효하지 않습니다.");
  state.trip = data.trip;
  state.items = data.items || [];
  state.members = data.members || [];
  state.activeDate = dateRange(state.trip.start_date, state.trip.end_date)[0];
  state.selectedId = null;
  setSync("공개 열람 중 · 로그인 후 수정");
  render();
  return true;
}
async function initializeAuth() {
  const { data, error } = await supabase.auth.getSession();
  if (error) setSync("로그인 상태를 확인하지 못했습니다");
  state.session = data?.session || null;
  updateAccountUI();
  if (state.session) {
    try { await loadCloudWorkspace(); } catch (loadError) {
      console.error(loadError);
      setSync("저장된 여행을 불러오지 못했습니다");
      showToast("여행 데이터를 불러오지 못했습니다.");
    }
  } else {
    try {
      const shared = await loadPublicSharedTrip();
      if (!shared) {
        setEmptyWorkspace();
        setSync("Google 로그인 후 여행을 만들 수 있습니다");
        render();
      }
    } catch (shareError) {
      setSync("공유 여행을 불러오지 못했습니다");
      showToast(shareError.message || "공유 링크를 확인해 주세요.");
      render();
    }
  }
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === "INITIAL_SESSION") return;
    state.session = session;
    if (session && event === "SIGNED_IN") setTimeout(() => loadCloudWorkspace().catch(error => showToast(error.message)), 0);
    updateAccountUI();
  });
}

function travelers(){return travelersFor(state.trip,state.members);}
function avatarUrl(person){const key=/^(male|female)-(00[1-9]|0[1-9]\d|1\d\d|200)$/.test(person.avatar || '') ? person.avatar : 'male-001';return `./assets/avatars/${key}.svg`;}
function faceHtml(person,alt=person.nickname){return `<img class="traveler-face" src="${avatarUrl(person)}" alt="${safe(alt)}" width="38" height="38">`;}
function renderTravelerFilter(){const select=$("#travelerFilter");const people=travelers();if(!people.some(p=>p.id===state.travelerFilter))state.travelerFilter='all';select.innerHTML='<option value="all">모두 보기</option>'+people.map(person=>`<option value="${safe(person.id)}">${safe(person.nickname)}</option>`).join('');select.value=state.travelerFilter;}
function renderAttendeeSummary(){const people=attendeesFor({participant_ids:state.participantIds},travelers());$("#attendeeSummary").innerHTML=`<div class="face-stack">${people.slice(0,4).map(person=>faceHtml(person)).join('')}</div><div><strong>${people.length}명 ${state.participantIds == null ? '모두 함께' : '함께'}</strong><small>${people.map(person=>safe(person.nickname)).join(' · ')}</small></div><span class="attendee-badge">${state.participantIds == null ? '전원 참석' : '개별 일정'}</span>`;}
function openAttendees(){const people=travelers();$("#attendEveryone").checked=state.participantIds==null;$("#attendeeOptions").innerHTML=people.map(person=>`<label class="attendee-choice">${faceHtml(person,'')}<span>${safe(person.nickname)}</span><input type="checkbox" value="${safe(person.id)}" ${state.participantIds==null || state.participantIds.includes(person.id) ? 'checked' : ''}></label>`).join('');$("#attendeeError").textContent='';$$("input",$("#attendeeOptions")).forEach(input=>input.addEventListener('change',()=>{$("#attendEveryone").checked=false;}));$("#attendeeDialog").showModal();}
function renderDraftTravelers(){const editable=state.rosterEditable;$("#travelerCount").textContent=`${state.draftTravelers.length}명`;$("#addTraveler").hidden=!editable;$("#travelerList").innerHTML=state.draftTravelers.map(person=>`<div class="traveler-row"><button type="button" class="traveler-avatar-button" data-change-avatar="${safe(person.id)}" aria-label="${safe(person.nickname || '여행자')} 얼굴 선택" ${editable?'':'disabled'}><img src="${avatarUrl(person)}" alt="선택한 캐릭터" width="44" height="44"></button><input data-nickname="${safe(person.id)}" aria-label="여행 인원 닉네임" value="${safe(person.nickname)}" placeholder="닉네임" maxlength="40" ${editable?'':'disabled'}><button type="button" class="remove-traveler" data-remove-traveler="${safe(person.id)}" aria-label="${safe(person.nickname || '여행자')} 인원 삭제" ${editable?'':'disabled'}>×</button></div>`).join('');
  $$('[data-nickname]').forEach(input=>input.addEventListener('input',()=>{state.draftTravelers.find(p=>p.id===input.dataset.nickname).nickname=input.value;}));
  $$('[data-change-avatar]').forEach(button=>button.addEventListener('click',()=>{state.avatarPerson=button.dataset.changeAvatar;const person=state.draftTravelers.find(p=>p.id===state.avatarPerson);state.avatarGroup=person.avatar?.startsWith('female')?'female':'male';state.avatarPage=Math.floor((Number(person.avatar?.split('-')[1] || 1)-1)/25);renderAvatarGrid();$("#avatarDialog").showModal();}));
  $$('[data-remove-traveler]').forEach(button=>button.addEventListener('click',()=>{const id=button.dataset.removeTraveler;if(state.draftTravelers.length<=1)return showToast('여행 인원은 한 명 이상 필요합니다.');const used=state.items.some(item=>item.participant_ids?.includes(id) || Object.hasOwn(item.split_ratios || {},id));if(used)return showToast('이 인원이 지정된 일정의 참석·정산 설정을 먼저 변경해 주세요.');state.draftTravelers=state.draftTravelers.filter(p=>p.id!==id);renderDraftTravelers();}));
}
function renderAvatarGrid(){const group=state.avatarGroup || 'female',page=state.avatarPage || 0,person=state.draftTravelers.find(p=>p.id===state.avatarPerson);$$('[data-avatar-group]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.avatarGroup===group)));$("#avatarGrid").innerHTML=Array.from({length:25},(_,index)=>{const number=page*25+index+1,key=`${group}-${String(number).padStart(3,'0')}`;return `<button type="button" class="avatar-option" data-avatar="${key}" aria-label="${group==='male'?'남성':'여성'} 캐릭터 ${number}" aria-pressed="${person?.avatar===key}"><img src="./assets/avatars/${key}.svg" alt="" width="70" height="70"></button>`;}).join('');$("#avatarPage").textContent=`${page+1} / 8`;$("#avatarPrevious").disabled=page===0;$("#avatarNext").disabled=page===7;$$('[data-avatar]').forEach(button=>button.addEventListener('click',()=>{if(person)person.avatar=button.dataset.avatar;renderDraftTravelers();$("#avatarDialog").close();}));}
async function renderEditorMap(place){const request=++state.editorMapRequest;if(place?.latitude==null || place?.longitude==null){$("#editorMapWrap").hidden=true;return;}try{await loadGoogleMaps();const {Map}=await google.maps.importLibrary('maps');const {AdvancedMarkerElement}=await google.maps.importLibrary('marker');if(request!==state.editorMapRequest||!$("#scheduleDialog").open)return;$("#editorMapWrap").hidden=false;$("#editorPlaceName").textContent=place.name || '선택한 위치';$("#editorPlaceAddress").textContent=place.address || `${Number(place.latitude).toFixed(5)}, ${Number(place.longitude).toFixed(5)}`;const position={lat:Number(place.latitude),lng:Number(place.longitude)};if(!state.editorMap)state.editorMap=new Map($("#editorMap"),{center:position,zoom:15,mapId:'DEMO_MAP_ID',disableDefaultUI:true,gestureHandling:'cooperative',clickableIcons:false});else {google.maps.event.trigger(state.editorMap,'resize');state.editorMap.setCenter(position);state.editorMap.setZoom(15);}if(state.editorMarker)state.editorMarker.map=null;state.editorMarker=new AdvancedMarkerElement({map:state.editorMap,position,title:place.name});}catch{if(request===state.editorMapRequest){$("#editorMapWrap").hidden=true;$("#mapsLinkStatus").textContent='장소는 선택됐지만 지도 미리보기를 불러오지 못했습니다.';}}}
async function resolvePastedMapsLink(query,requestId){let parsed=parseMapsUrl(query);if(parsed.short){const {data,error}=await supabase.functions.invoke('resolve-maps-link',{body:{url:parsed.url}});if(error || data?.error)throw new Error(data?.error || '짧은 링크를 확인하지 못했습니다. Google 지도에서 주소창의 전체 링크를 복사해 주세요.');parsed=parseMapsUrl(data.url);}if(requestId!==state.placeResolveRequest)return;
  if(parsed.placeId){await loadGoogleMaps();const {Place}=await google.maps.importLibrary('places');const place=new Place({id:parsed.placeId});await place.fetchFields({fields:['id','displayName','formattedAddress','location','googleMapsURI']});if(requestId===state.placeResolveRequest)selectGooglePlace(place);return;}
  if(parsed.name){const places=await findGooglePlaces(parsed.name,parsed.bias);if(requestId!==state.placeResolveRequest)return;if(places.length){const results=$("#placeSearchResults");results.innerHTML=places.map((place,index)=>`<button type="button" role="option" data-link-place="${index}"><strong>${safe(place.displayName)}</strong><small>${safe(place.formattedAddress || '')}</small></button>`).join('');results.hidden=false;$("#placeSearchInput").setAttribute('aria-expanded','true');$$('[data-link-place]',results).forEach(button=>button.addEventListener('click',()=>selectGooglePlace(places[Number(button.dataset.linkPlace)])));$("#mapsLinkStatus").textContent='링크의 장소를 찾았습니다. 주소를 확인하고 선택해 주세요.';$("#mapsLinkStatus").className='field-hint';if(parsed.location)renderEditorMap({latitude:parsed.location.lat,longitude:parsed.location.lng,name:parsed.name});return;}}
  if(parsed.location){state.pendingPlace={mapsUrl:parsed.url,placeId:null,latitude:parsed.location.lat,longitude:parsed.location.lng,name:parsed.name || '선택한 위치',address:''};$("#mapsUrlInput").value=parsed.url;$("#placeSearchResults").hidden=true;$("#placeSearchInput").setAttribute('aria-expanded','false');$("#clearPlaceButton").hidden=false;$("#mapsLinkStatus").textContent='링크의 위치를 확인했습니다.';$("#mapsLinkStatus").className='field-hint is-success';renderEditorMap(state.pendingPlace);return;}
  throw new Error('이 링크에서 위치를 확인하지 못했습니다. 장소 이름으로 검색하거나 Google 지도에서 장소 공유 링크를 다시 복사해 주세요.');
}


function openNamedDialog(id) {
  if (id === "settlementDialog") renderReceipt();
  if (id === "inviteDialog") renderMembers();
  document.getElementById(id).showModal();
}
$$("[data-open-dialog]").forEach(button => button.addEventListener("click", () => openNamedDialog(button.dataset.openDialog)));
$$(".dialog-close, .dialog-close-text").forEach(button => button.addEventListener("click", () => button.closest("dialog").close()));
$$("dialog").forEach(dialog => dialog.addEventListener("click", event => {
  const box = dialog.getBoundingClientRect();
  if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
}));
$("#addScheduleButton").addEventListener("click", () => openSchedule());
$("#deleteScheduleButton").addEventListener("click", deleteSchedule);
$("#scheduleForm").addEventListener("submit", saveSchedule);
$("#tripSelect").addEventListener("change", event => switchTrip(event.target.value).catch(error => showToast(error.message)));
$("#manageTripsButton").addEventListener("click", () => openTripManager());
$("#newTripButton").addEventListener("click", () => resetTripForm());
$("#tripForm").addEventListener("submit", saveTrip);
$("#deleteTripButton").addEventListener("click", deleteTrip);
$("#splitType").addEventListener("change", event => { if (event.target.value === "custom") renderRatioFields(); toggleSettlement($("#settlementEnabled").checked); });
$("#iconSearch").addEventListener("input", event => renderIcons(event.target.value));
$("#iconCategory").addEventListener("change", () => { $("#iconSearch").value = ""; renderIcons(); });
$("#toggleEndTime").addEventListener("change", event => toggleEndTime(event.target.checked));
let placeSearchTimer;
$("#placeSearchInput").addEventListener("input", event => {
  clearTimeout(placeSearchTimer);
  state.placeResolveRequest++; state.editorMapRequest++; state.pendingPlace = null;
  $("#editorMapWrap").hidden = true;
  $("#mapsUrlInput").value = "";
  $("#clearPlaceButton").hidden = !event.target.value;
  placeSearchTimer = setTimeout(() => searchGooglePlaces(event.target.value), 350);
});
$("#clearPlaceButton").addEventListener("click", () => clearPlaceSelection());
$("#scheduleForm").elements.name.addEventListener("input", event => { event.target.dataset.autoFilled = "false"; });
$("#addCategory").addEventListener("click", addCategory);
$("#newCategory").addEventListener("keydown", event => { if (event.key === "Enter") { event.preventDefault(); addCategory(); } });
$("#previousStop").addEventListener("click", () => {
  const items = activeItems();
  const index = items.findIndex(item => item.id === state.selectedId);
  if (index > 0) selectStop(items[index - 1].id, true);
});
$("#nextStop").addEventListener("click", () => {
  const items = activeItems();
  const index = items.findIndex(item => item.id === state.selectedId);
  if (index < items.length - 1) selectStop(items[index + 1].id, true);
});
$("#imageDialog .image-close").addEventListener("click", () => $("#imageDialog").close());
$("#copyInvite").addEventListener("click", copyInvite);
$("#googleSignIn").addEventListener("click", signInWithGoogle);
$("#signOutButton").addEventListener("click", signOut);

$("#settlementEnabled").addEventListener("change",event=>toggleSettlement(event.target.checked));
$("#openIconPicker").addEventListener("click",()=>{renderIcons();$("#iconDialog").showModal();});
$("#openMemo").addEventListener("click",()=>{$("#memoEditor").value=$("#savedMemo").value;$("#memoDialog").showModal();});
$("#saveMemo").addEventListener("click",()=>{$("#savedMemo").value=$("#memoEditor").value.trim();$("#memoSummary").textContent=$("#savedMemo").value || "＋ 세부 메모 추가";$("#memoDialog").close();});
$("#categoryDropdown").addEventListener("click",()=>{const open=$("#categoryMenu").hidden;$("#categoryMenu").hidden=!open;$("#categoryDropdown").setAttribute("aria-expanded",String(open));});
$("#openCategoryManager").addEventListener("click",()=>{closeCategoryMenu();$("#categoryDialog").showModal();});
$("#openAttendees").addEventListener("click",openAttendees);
$("#attendEveryone").addEventListener("change",event=>{if(event.target.checked)$$("input",$("#attendeeOptions")).forEach(input=>{input.checked=true;});});
$("#saveAttendees").addEventListener("click",()=>{const selected=$$("input:checked",$("#attendeeOptions")).map(input=>input.value);if(!selected.length){$("#attendeeError").textContent="한 명 이상 선택해 주세요.";return;}state.participantIds=$("#attendEveryone").checked?null:selected;renderAttendeeSummary();renderRatioFields();toggleSettlement($("#settlementEnabled").checked);$("#attendeeDialog").close();});
$("#addTraveler").addEventListener("click",()=>{if(state.draftTravelers.length>=100)return showToast("최대 100명까지 추가할 수 있습니다.");state.draftTravelers.push({id:crypto.randomUUID(),nickname:"",avatar:`female-${String(state.draftTravelers.length%200+1).padStart(3,'0')}`});renderDraftTravelers();$$("[data-nickname]").at(-1)?.focus();});
$$('[data-avatar-group]').forEach(button=>button.addEventListener('click',()=>{state.avatarGroup=button.dataset.avatarGroup;state.avatarPage=0;renderAvatarGrid();}));
$("#avatarPrevious").addEventListener("click",()=>{state.avatarPage=Math.max(0,state.avatarPage-1);renderAvatarGrid();});
$("#avatarNext").addEventListener("click",()=>{state.avatarPage=Math.min(7,state.avatarPage+1);renderAvatarGrid();});
$("#travelerFilter").addEventListener("change",event=>{state.travelerFilter=event.target.value;state.selectedId=null;render();});
$("#placeSearchInput").addEventListener("keydown",event=>{if(event.key==='Enter'){event.preventDefault();clearTimeout(placeSearchTimer);searchGooglePlaces(event.target.value);}if(event.key==='Escape'){$("#placeSearchResults").hidden=true;event.stopPropagation();}});
$("#scheduleDialog").addEventListener("close",()=>{state.placeResolveRequest++;state.editorMapRequest++;clearTimeout(placeSearchTimer);closeCategoryMenu();});
$("#scheduleDialog").addEventListener("click",event=>{if(!event.target.closest('.category-picker'))closeCategoryMenu();});
fillTimeOptions();
renderIcons();
renderCategories();
render();
Promise.allSettled([initMap(), initializeAuth()]);
setTimeout(scrollToCurrentScheduleOnMobile, 500);
setInterval(updateAutoSaveStatus, 60000);
