// =========================
// Data-driven Skill Tree Runtime (edges + gating + legend toggle)
// =========================

// --- Pan/Zoom state ---
let scale = 1;
let originX = 0;
let originY = 0;
let isDragging = false;
let startX = 0, startY = 0;

const GRID = 80;  // px per grid step; matches node size
const NODE_SIZE = 40;
const nodes = {};   // id -> { ...data, tierId, el, unlocked }
const tiers = {};   // id -> { id, name, origin:{gx,gy}, nodes:[ids], collapsed }
const parents = {}; // id -> [parentIds]
let activeTierId = null;   // current tier context (set after load)
let unlockHistory = [];       // stack of unlocked node ids (for fair refunds)

// Resource counters
let tpUsed = 0;
let sealUsed = 0;

// Track whether we've already toasted Verdant completion
let verdantToastShown = false;

// ---------- Utilities ----------
function $(sel){ return document.querySelector(sel); }
function $all(sel){ return Array.from(document.querySelectorAll(sel)); }

function applyTransform(){
  const z = $("#zoomArea");
  if (!z) return;
  z.style.transform = `translate(${originX}px, ${originY}px) scale(${scale})`;
}

// ---------- Sidebar ----------
function setSidebarPreview(iconFile) {
  const preview = document.getElementById("hoverPreview");
  if (!preview) return;
  if (iconFile) {
    preview.src = `Skills/${iconFile}`;
    preview.style.display = "block";
  } else {
    preview.src = "";
    preview.style.display = "none";
  }
}

function setSidebarInfo(html) {
  const box = document.querySelector(".sidebar-text");
  if (!box) return;
  box.innerHTML = html || "No node selected";
}

function formatNodeInfo(node){
  const cost = node.cost ?? 0;
  const seal = node.seal ?? 0;
  const desc = node.desc || "";

  // update sidebar image here
  setSidebarPreview(node.icon);

  return `
    <div style="line-height:1.4; height:100%; display:flex; flex-direction:column; box-sizing:border-box; padding-left:30px; padding-right:10px;">
      <div>
        <div style="font-weight:700; font-size:22px; font:bold;">${node.name || node.id}</div>
        ${desc ? `<div style="margin-bottom:12px; word-wrap:break-word; font-size:16px; overflow-wrap:break-word;">${desc}</div>` : ""}
      </div>

      <!-- Cost/Seals area offset ~15% from bottom -->
      <div style="margin-top:auto; position:relative; bottom:0px;">
        <div style="display:grid; grid-template-columns: auto auto; text-align:center; gap:10px; align-items:center; justify-content:center;">
          <div style="display:flex; flex-direction:column; align-items:center;">
            <img src="img/talentp.png" style="width:75px; height:75px;" alt="TP">
            <div style="opacity:.85; white-space:nowrap;">Cost: ${cost} TP</div>
          </div>
          <div style="display:flex; flex-direction:column; align-items:center;">
            <img src="img/aseal.png" style="width:75px; height:75px;" alt="Seal">
            <div style="opacity:.85; white-space:nowrap;">Seals: ${seal}</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

// --- Clear Button
function bindClearSidebar(){
  const btn = document.getElementById("clearSidebar");
  if(!btn) return;
  btn.addEventListener("click", () => {
    setSidebarInfo(""); // blank out sidebar
    setSidebarPreview(null); // hide the preview image
  });
}

// ---------- Legend toggle ----------
function bindLegend(){
  const legend = document.getElementById("legendBox") || document.querySelector(".legend");
  if(!legend) return;
  const collapsed = legend.querySelector(".legend-collapsed");
  const expanded  = legend.querySelector(".legend-expanded");
  // start collapsed
  if(expanded) expanded.style.display = "none";
  if(collapsed) collapsed.style.display = "block";
  legend.classList.remove("expanded");

  legend.addEventListener("click", () => {
    const isExpanded = legend.classList.contains("expanded");
    if(isExpanded){
      legend.classList.remove("expanded");
      if(expanded) expanded.style.display = "none";
      if(collapsed) collapsed.style.display = "block";
    }else{
      legend.classList.add("expanded");
      if(collapsed) collapsed.style.display = "none";
      if(expanded) expanded.style.display = "block";
    }
  });
}

// ---------- Resources ----------
function getTpMax(){ return parseInt(document.getElementById("tpMax").value,10) || 0; }
function getSealMax(){ return parseInt(document.getElementById("sealMax").value,10) || 0; }

function updateCounters(){
  $("#tpUsed").textContent = tpUsed;
  $("#sealUsed").textContent = sealUsed;
  enforceResourceLimits();
}

function enforceResourceLimits(){
  const tpMax = getTpMax();
  const sealMax = getSealMax();
  while(tpUsed > tpMax || sealUsed > sealMax){
    // refund last unlocked node
    let id = unlockHistory.pop();
    if(!id) break;
    if(nodes[id]?.unlocked){
      refundNode(id, true);
    }
  }
}

// ---------- Helpers for gating ----------
function verdantComplete(){
  // assume the first(tiers order) is base
  const base = getBaseTierId();
  if(!base) return false;
  const t = tiers[base];
  if(!t) return false;
  // Count base nodes unlocked
  let count = 0;
  for(const id of t.nodes){
    if(nodes[id]?.unlocked) count++;
  }
  // You currently use 30 as finishing condition â€” preserve that
  return count >= 30;
}

function isVisible(el){
  return el && el.style.display !== "none";
}

function getBaseTierId(){
  // derive base as first tier keyed by insertion order.
  // Since we create tiers in buildFromJSON in JSON order, pick the first one.
  const keys = Object.keys(tiers);
  return keys.length ? keys[0] : null;
}

// ---------- Unlock Preconditions ----------
function computeParents(){
  for(const id in nodes){
    parents[id] = parents[id] || [];
  }
  for(const id in nodes){
    const n = nodes[id];
    if(n.children && n.children.length){
      for(const c of n.children){
        parents[c] = parents[c] || [];
        if(!parents[c].includes(id)){
          parents[c].push(id);
        }
      }
    }
  }
}

function parentsSatisfied(nodeId){
  const reqs = parents[nodeId] || [];
  if (reqs.length === 0) return true;
  return reqs.some(r => nodes[r] && nodes[r].unlocked);
}

function canUnlock(node){
  if(!node) return false;

  // nodeId is case-sensitive in JSON â€” use the actual id
  const id = (node.id || "");
  const base = getBaseTierId();

  // If this is a tier root (ends with "01")
  const isRoot = id.endsWith("01");

  // Root nodes for non-base tiers require base completion
  if(isRoot && node.tierId !== base){
    if(!verdantComplete()) return false;
  }

  // For specialization nodes (non-root nodes of non-base tiers), require the tier root be unlocked
  if(node.tierId !== base && !isRoot){
    const rootId = `${node.tierId}01`;
    if(!nodes[rootId]?.unlocked) return false;
  }

  if(!parentsSatisfied(node.id)) return false;

  const tpMax = getTpMax();
  const sealMax = getSealMax();
  if(tpUsed + (node.cost||0) > tpMax) return false;
  if(sealUsed + (node.seal||0) > sealMax) return false;
  return true;
}

// ---------- Unlock / Refund ----------
function revealTierMembers(tierId){
  const t = tiers[tierId];
  if(!t) return;
  // show all nodes in that tier (except maybe keep root as-is)
  for(const id of t.nodes){
    if(nodes[id] && nodes[id].el) nodes[id].el.style.display = "block";
  }
}

function hideTierMembersExceptRoot(tierId){
  const t = tiers[tierId];
  if(!t) return;
  const rootId = `${tierId}01`;
  for(const id of t.nodes){
    if(id !== rootId && nodes[id] && nodes[id].el) nodes[id].el.style.display = "none";
  }
}

function resetOtherSpecializations(chosenTierId){
  // Reset/unshow other specialization tiers (any tier except base and chosen)
  const base = getBaseTierId();
  for(const tid in tiers){
    if(tid === base || tid === chosenTierId) continue;
    resetTier(tid, true);
  }
}

function unlockNode(nodeId){
  const node = nodes[nodeId];
  if(!node || node.unlocked) return;

  // Special root handling (generic)
  const isRoot = (nodeId || "").endsWith("01");
  if(isRoot && node.tierId !== getBaseTierId()){
    // picking a specialization root resets other specializations
    resetOtherSpecializations(node.tierId);
    // reveal all nodes for this tier
    revealTierMembers(node.tierId);
  }

  if(!canUnlock(node)) return; // must check AFTER special reset

  node.unlocked = true;
  node.el.classList.add("unlocked");
  tpUsed += (node.cost||0);
  sealUsed += (node.seal||0);
  if(!unlockHistory.includes(nodeId)) unlockHistory.push(nodeId);

  updateCounters();
  activeTierId = node.tierId;
  setSidebarInfo(formatNodeInfo(node));
  drawEdges();
}

function refundNode(nodeId, silent=false){
  const node = nodes[nodeId];
  if(!node || !node.unlocked) return;

  if (node.children && node.children.length) {
    for (const c of node.children) {
      const child = nodes[c];
      if (!child?.unlocked) continue;
      const stillHasParent = (parents[c] || []).some(pid => pid !== nodeId && nodes[pid]?.unlocked);
      if (!stillHasParent) {
        refundNode(c, true);
      }
    }
  }

  node.unlocked = false;
  node.el.classList.remove("unlocked");
  tpUsed -= (node.cost||0);
  sealUsed -= (node.seal||0);
  if(tpUsed<0) tpUsed=0;
  if(sealUsed<0) sealUsed=0;

  // ðŸš« Donâ€™t collapse SoulMâ€™s children
  const isRoot = (nodeId || "").endsWith("01");
  const isBaseRoot = (nodeId === `${getBaseTierId()}01`);
  if(isRoot && !isBaseRoot){
    hideTierMembersExceptRoot(node.tierId);
  }

  const idx = unlockHistory.lastIndexOf(nodeId);
  if(idx !== -1) unlockHistory.splice(idx,1);

  if(!silent) updateCounters();
  drawEdges();
}

// ---------- Build from JSON ----------
function buildFromJSON(data){
  const z = $("#zoomArea");
  if (!z) return;

  // Ensure edges SVG is present under nodes
  let svg = document.getElementById("edgesLayer");
  const SVG_NS = "http://www.w3.org/2000/svg";
  if(!svg){
    svg = document.createElementNS(SVG_NS,"svg");
    svg.setAttribute("id","edgesLayer");
    svg.style.position = "absolute";
    svg.style.left = "0";
    svg.style.top = "0";
    svg.setAttribute("width","5000");
    svg.setAttribute("height","5000");
    svg.setAttribute("viewBox","0 0 5000 5000");
    svg.style.width = "5000px";
    svg.style.height = "5000px";
    svg.style.zIndex = "1";

    const defs = document.createElementNS(SVG_NS, "defs");
    const mask = document.createElementNS(SVG_NS, "mask");
    mask.setAttribute("id","edgesMask");
    mask.setAttribute("maskUnits","userSpaceOnUse");
    const rect = document.createElementNS(SVG_NS, "rect");
    rect.setAttribute("x","0");
    rect.setAttribute("y","0");
    rect.setAttribute("width","5000");
    rect.setAttribute("height","5000");
    rect.setAttribute("fill","white");
    mask.appendChild(rect);
    defs.appendChild(mask);
    svg.appendChild(defs);

    const edgesGroup = document.createElementNS(SVG_NS,"g");
    edgesGroup.setAttribute("id","edgesGroup");
    edgesGroup.setAttribute("mask","url(#edgesMask)");
    svg.appendChild(edgesGroup);

    z.appendChild(svg);
  }

  // clear existing nodes if any
  for(const id in nodes){
    try { if(nodes[id]?.el?.remove) nodes[id].el.remove(); } catch(e){}
  }
  Object.keys(nodes).forEach(k=>delete nodes[k]);
  Object.keys(tiers).forEach(k=>delete tiers[k]);

  // Build tiers in JSON order (so base is first)
  (data.tiers || []).forEach(t => {
    const tId = t.id;
    tiers[tId] = { id: tId, name: t.name, origin: t.origin || {gx:0,gy:0}, nodes: [], collapsed: !!t.collapsed };
  });

// Now iterate again to create nodes (keeps tier order separate)
(data.tiers || []).forEach(t => {
  const tId = t.id;
  const ox = t.origin?.gx ?? 0;
  const oy = t.origin?.gy ?? 0;
  const isCollapsed = (tId === getBaseTierId()) ? false : !!t.collapsed;

  // âœ… resolve base once per tier
  const baseTierId = getBaseTierId();

  (t.nodes || []).forEach(n => {
    const nx = (ox + (n.gx || 0)) * GRID;
    const ny = (oy + (n.gy || 0)) * GRID;

    const el = document.createElement("div");
    el.classList.add("node", "locked");

    const lname = (n.name || "").toLowerCase();

    // âœ… Decide size
    if ((n.id || "").endsWith("01") && tId !== baseTierId) {
      el.classList.add("size3");
    } else if (["stamina", "agility", "thunder attack",].includes(lname)) {
      el.classList.add("size2");
    } else {
      el.classList.add("size1");
    }

    z.appendChild(el);

      // force reflow to get computed sizes
      const w = el.offsetWidth || parseFloat(window.getComputedStyle(el).width) || 60;
      const h = el.offsetHeight || parseFloat(window.getComputedStyle(el).height) || 60;

      el.style.left = `${nx - w / 2}px`;
      el.style.top  = `${ny - h / 2}px`;

      el.dataset.id = n.id;
      el.dataset.tier = tId;

      if (n.icon) {
        const img = document.createElement("img");
        img.src = `Skills/${n.icon}`;
        img.alt = n.name || n.id;
        img.className = "node-icon";
        el.appendChild(img);
      }

      nodes[n.id] = { ...n, tierId:tId, el, unlocked:false };
      tiers[tId].nodes.push(n.id);

      // initial visibility: if tier is collapsed then hide non-root nodes; otherwise show everything
      if (isCollapsed && !(n.id || "").endsWith("01")) {
        el.style.display = "none";
      } else {
        el.style.display = "block";
      }

      el.addEventListener("mouseenter",()=>{ setSidebarInfo(formatNodeInfo(nodes[n.id])); });
      el.addEventListener("click",()=>{ activeTierId = tId; unlockNode(n.id); });
      el.addEventListener("contextmenu",(e)=>{ e.preventDefault(); activeTierId = tId; refundNode(n.id); });
    });
  });

  computeParents();
  drawEdges();

  // Build dynamic header buttons now that tiers are known
  buildHeaderButtons();
}

// ---------- Edges ----------
function drawEdges(){
  const SVG_NS = "http://www.w3.org/2000/svg";
  const svg = document.getElementById("edgesLayer");
  if(!svg) return;

  const defs = svg.querySelector("defs");
  if(!defs) return;
  let mask = defs.querySelector("#edgesMask");
  if(!mask){
    mask = document.createElementNS(SVG_NS,"mask");
    mask.setAttribute("id","edgesMask");
    mask.setAttribute("maskUnits","userSpaceOnUse");
    defs.appendChild(mask);
  }

  while(mask.firstChild) mask.removeChild(mask.firstChild);

  const svgW = parseFloat(svg.getAttribute("width")) || 5000;
  const svgH = parseFloat(svg.getAttribute("height")) || 5000;
  const bgRect = document.createElementNS(SVG_NS,"rect");
  bgRect.setAttribute("x","0");
  bgRect.setAttribute("y","0");
  bgRect.setAttribute("width", String(svgW));
  bgRect.setAttribute("height", String(svgH));
  bgRect.setAttribute("fill","white");
  mask.appendChild(bgRect);

  for(const id in nodes){
    const n = nodes[id];
    if(!n || !n.el) continue;
    const el = n.el;
    if(!isVisible(el)) continue;

    const cx = parseFloat(el.style.left) + (el.offsetWidth / 2);
    const cy = parseFloat(el.style.top)  + (el.offsetHeight / 2);

    const baseR = Math.max(el.offsetWidth, el.offsetHeight) / 2;
    const shrinkPx = 2;
    const radius = Math.max(0, baseR - shrinkPx);

    const c = document.createElementNS(SVG_NS,"circle");
    c.setAttribute("cx", String(Math.round(cx)));
    c.setAttribute("cy", String(Math.round(cy)));
    c.setAttribute("r", String(radius));
    c.setAttribute("fill", "black");
    mask.appendChild(c);
  }

  let edgesGroup = svg.querySelector("#edgesGroup");
  if(!edgesGroup){
    edgesGroup = document.createElementNS(SVG_NS,"g");
    edgesGroup.setAttribute("id","edgesGroup");
    edgesGroup.setAttribute("mask","url(#edgesMask)");
    svg.appendChild(edgesGroup);
  }
  edgesGroup.setAttribute("mask","url(#edgesMask)");

  while(edgesGroup.firstChild) edgesGroup.removeChild(edgesGroup.firstChild);

  for(const pid in nodes){
    const p = nodes[pid];
    if(!p.children || !p.children.length) continue;
    const pEl = p.el;
    if(!pEl || !isVisible(pEl)) continue;

    const px = parseFloat(pEl.style.left) + pEl.offsetWidth / 2;
    const py = parseFloat(pEl.style.top)  + pEl.offsetHeight / 2;

    for (const cid of p.children) {
      const c = nodes[cid];
      if (!c) continue;
      const cEl = c.el;
      if (!cEl || !isVisible(cEl)) continue;

      const cx = parseFloat(cEl.style.left) + cEl.offsetWidth / 2;
      const cy = parseFloat(cEl.style.top)  + cEl.offsetHeight / 2;

      const line = document.createElementNS(SVG_NS,"line");
      line.setAttribute("x1", px);
      line.setAttribute("y1", py);
      line.setAttribute("x2", cx);
      line.setAttribute("y2", cy);
      if (p.unlocked) {
        line.classList.add("edge", "edge-unlocked");
      } else {
        line.classList.add("edge", "edge-locked");
      }

      edgesGroup.appendChild(line);
    }
  }
}

// ---------- Centering ----------
function centerOnRoot(nodeId) {
  const node = nodes[nodeId];
  if (!node?.el) return;

  // World coords = where the node is inside the zoom area
  const nx = parseFloat(node.el.style.left) + node.el.offsetWidth / 2;
  const ny = parseFloat(node.el.style.top)  + node.el.offsetHeight / 2;

  // Desired screen position = horizontally centered, near top
  const mainRect = document.querySelector("main").getBoundingClientRect();
  const header = document.querySelector("header");
  const headerH = header ? header.offsetHeight : 0;

  const anchorX = mainRect.width / 2;
  const anchorY = headerH + 40; // padding under header

  // Compute target translation in world â†’ screen math
  const targetX = anchorX - nx * scale;
  const targetY = anchorY - ny * scale;

  // Animate pan
  const sx = originX, sy = originY;
  const duration = 300;
  const t0 = performance.now();
  function step(now) {
    const t = Math.min((now - t0) / duration, 1);
    const ease = 1 - Math.pow(1 - t, 3);
    originX = sx + (targetX - sx) * ease;
    originY = sy + (targetY - sy) * ease;
    applyTransform();
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function centerOnTierRoot(tierId) {
  const rootId = `${tierId}01`;
  if (!rootId || !nodes[rootId]) return;
  centerOnRoot(rootId);
  activeTierId = tierId;
}

// ---------- Pan/Zoom ----------
function bindPanZoom(){
  const z = $("#zoomArea");
  if (!z) return;

  document.addEventListener("wheel", (e) => {
    if (e.target.closest("aside")) return;
    e.preventDefault();
    const rect = z.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const speed = 0.1;
    const factor = e.deltaY < 0 ? 1 + speed : 1 - speed;
    const newScale = scale * factor;

    originX -= (mx / scale) * (newScale - scale);
    originY -= (my / scale) * (newScale - scale);
    scale = newScale;
    applyTransform();
  }, { passive: false });

  z.addEventListener("mousedown", (e) => {
    if (e.target.classList.contains("node")) return;
    isDragging = true;
    startX = e.clientX - originX;
    startY = e.clientY - originY;
  });

  document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    originX = e.clientX - startX;
    originY = e.clientY - startY;
    applyTransform();
  });

  document.addEventListener("mouseup", () => { isDragging = false; });
}

// ---------- Header buttons ----------
function topologicalUnlockOrder(tid){
  const order = [];
  const visited = new Set();
  let progress = true;
  while(progress){
    progress = false;
    for(const id of tiers[tid].nodes){
      const n = nodes[id];
      if(!n || n.unlocked || visited.has(id)) continue;
      if(canUnlock(n)){
        order.push(id);
        visited.add(id);
        progress = true;
      }
    }
  }
  return order;
}

function maxTier(tid){
  const t = tiers[tid]; if(!t) return;
  // Ensure root unlocked for non-base tiers
  const base = getBaseTierId();
  const rootId = `${tid}01`;
  if(tid !== base && !nodes[rootId]?.unlocked){
    unlockNode(rootId);
  }
  let changed = true;
  while(changed){
    changed = false;
    for(const id of t.nodes){
      if(!nodes[id].unlocked){
        const beforeTP=tpUsed, beforeSeal=sealUsed;
        unlockNode(id);
        if(tpUsed!==beforeTP || sealUsed!==beforeSeal) changed = true;
      }
    }
  }
  activeTierId = tid;
}

function maxCurrentTree(){
  const base = getBaseTierId();
  if(!base) return;

  const verdantDone = verdantComplete();

  if (!verdantDone) {
    maxTier(base); // only run if not already maxed
    if (verdantComplete() && !verdantToastShown) {
      showToast(`Maxed ${tiers[base].name}`);
      verdantToastShown = true;
    }
    updateCounters();
    drawEdges();
    return; // stop here since we're still filling base
  }

  // If Verdant is done check specializations: pick one that is unlocked
  let chosen = null;
  for(const tid in tiers){
    if(tid === base) continue;
    if(nodes[`${tid}01`]?.unlocked){ chosen = tid; break; }
  }

  if (chosen) {
    maxTier(chosen);
    showToast(`Maxed ${tiers[chosen].name}`);
  } else {
    if (!verdantToastShown) {
      showToast(`Maxed ${tiers[base].name}`);
      verdantToastShown = true;
    }
    showToast("Select a sub-class specialization");
  }

  updateCounters();
  drawEdges();
}

// Reset functions
function resetTier(tid, silent=false){
  const t = tiers[tid]; if(!t) return;
  // refund unlocked nodes in reverse-ish order
  const rootsLast = [...t.nodes].sort((a,b)=>{
    const aRoot = a.endsWith("01") ? 1 : 0;
    const bRoot = b.endsWith("01") ? 1 : 0;
    return aRoot - bRoot;
  });
  for(const id of rootsLast){
    if(nodes[id].unlocked) refundNode(id, true);
    // hide non-root nodes if tier is collapsed
    if(t.collapsed){
      if(id.endsWith("01")){
        // hide other members
        if(tid && tiers[tid]) {
          tiers[tid].nodes.forEach(nid=>{ if(nid!==(tid+"01")) nodes[nid].el.style.display="none"; });
        }
      }
    }
  }
  if(!silent) {
    updateCounters();
    if (tiers[tid] && tiers[tid].name) showToast(`Reset ${tiers[tid].name} Tree`);
  }
  drawEdges();
}

function resetAll(){
  // reset all tiers
  for(const tid in tiers){
    resetTier(tid, true);
  }
  updateCounters();
  drawEdges();
  showToast("All Trees Reset");
}

function resetCur(){
  const base = getBaseTierId();
  let found = false;

  // 1. Check specializations first
  for(const tid in tiers){
    if(tid === base) continue; // skip base here
    if(nodes[`${tid}01`]?.unlocked){
      resetTier(tid);
      showToast(`Reset ${tiers[tid].name} Tree`);
      found = true;
      break;
    }
  }

  // 2. If none found, reset base
  if(!found && nodes[`${base}01`]?.unlocked){
    resetTier(base);
    showToast(`Reset ${tiers[base].name} Tree`);
  }

  updateCounters();
  drawEdges();
}




function buildHeaderButtons(){
  const container = document.getElementById("tierButtons");
  if(!container) return;

  container.innerHTML = "";

  for(const tid of Object.keys(tiers)){
    const info = tiers[tid];

    // Tier name button (parent container)
    const nameBtn = document.createElement("button");
    nameBtn.className = "tier-name-btn";
    nameBtn.textContent = info.name || tid;

    // Center click on tier root
    nameBtn.addEventListener("click", () => { centerOnTierRoot(tid); });

    // Max badge
    const maxImg = document.createElement("img");
    maxImg.src = "img/up-arrow.png"; // your icon path
    maxImg.alt = "Max";
    maxImg.className = "tier-badge max-badge";
    maxImg.addEventListener("click", (e)=>{
      e.stopPropagation(); // prevent triggering tier click
      maxTier(tid);
    });

    // Reset badge
    const resetImg = document.createElement("img");
    resetImg.src = "img/reset.png"; // your icon path
    resetImg.alt = "Reset";
    resetImg.className = "tier-badge reset-badge";
    resetImg.addEventListener("click", (e)=>{
      e.stopPropagation();
      resetTier(tid);
    });

    // Append badges to button
    nameBtn.appendChild(maxImg);
    nameBtn.appendChild(resetImg);

    container.appendChild(nameBtn);
  }

  // Rebind global controls
  $("#tpMax")?.addEventListener("input", updateCounters);
  $("#sealMax")?.addEventListener("input", updateCounters);
}




// ----- Toast 
function showToast(message) {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;

  container.appendChild(toast);

  // If more than 3 toasts, remove the oldest (first one in the stack)
  while (container.children.length > 3) {
    container.removeChild(container.firstChild);
  }

  // Fade in
  requestAnimationFrame(() => toast.classList.add("show"));

  // Auto-remove after 2.5s
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

// ---------- Boot ----------
window.addEventListener("load", () => {
  bindLegend();
  bindPanZoom();
  bindClearSidebar();
  applyTransform();

  fetch("merged.json")
    .then(r=>r.json())
    .then(data=>{
      // buildFromJSON will call buildHeaderButtons() at the end
      buildFromJSON(data);

      // center on base tier
      const base = getBaseTierId();
      if(base) centerOnTierRoot(base);

      updateCounters();
    })
    .catch(err=>console.error("Failed to load merged.json", err));
});
