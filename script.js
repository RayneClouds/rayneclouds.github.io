
// =========================
// Skill Tree Runtime (with edges + gating + legend toggle)
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
const tiers = {};   // id -> { id, name, origin:{gx,gy}, nodes:[ids] }
const parents = {}; // id -> [parentIds]
let activeTierId = "Verdo";   // current tier context
let unlockHistory = [];       // stack of unlocked node ids (for fair refunds)

// Resource counters
let tpUsed = 0;
let sealUsed = 0;

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

function setSidebarInfo(html){
  const box = document.querySelector(".sidebar-text");
  if (!box) return;
  box.innerHTML = html;
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
      <div style="margin-top:auto; position:relative; bottom:15%;">
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
  const t = tiers["Verdo"];
  if(!t) return false;
  // Count Verdant nodes unlocked
  let count = 0;
  for(const id of t.nodes){
    if(nodes[id]?.unlocked) count++;
  }
  return count >= 30;
}

function isVisible(el){
  return el && el.style.display !== "none";
}

// ---------- Unlock Preconditions ----------
function computeParents(){
  // Build parent lists from children
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
  if (reqs.length === 0) return true; // no parents required
  // ✅ at least one parent is unlocked
  return reqs.some(r => nodes[r] && nodes[r].unlocked);
}


function canUnlock(node){
  // explicit gating for Smite01 / Lifeb01
  const id = (node.id || "").toLowerCase();
  if(id === "smite01" || id === "lifeb01"){
    if(!verdantComplete()) return false;
  }
  // Smite/Lifeb children: require root unlocked
  if(node.tierId === "Smite" && node.id !== "Smite01"){
    if(!nodes["Smite01"]?.unlocked) return false;
  }
  if(node.tierId === "Lifeb" && node.id !== "Lifeb01"){
    if(!nodes["Lifeb01"]?.unlocked) return false;
  }
  // parents / prerequisites
  if(!parentsSatisfied(node.id)) return false;
  // resources
  const tpMax = getTpMax();
  const sealMax = getSealMax();
  if(tpUsed + (node.cost||0) > tpMax) return false;
  if(sealUsed + (node.seal||0) > sealMax) return false;
  return true;
}

// ---------- Unlock / Refund ----------
function unlockNode(nodeId){
  const node = nodes[nodeId];
  if(!node || node.unlocked) return;
  if(!canUnlock(node)) return;

  // Exclusivity: if unlocking Smite01, auto refund Lifeb tier; vice versa
  const idLow = (nodeId||"").toLowerCase();
  if(idLow === "smite01"){
    resetTier("Lifeb", true); // silent
    // reveal smite children
    tiers["Smite"].nodes.forEach(id=>{ if(id!=="Smite01") nodes[id].el.style.display="block"; });
  }
  if(idLow === "lifeb01"){
    resetTier("Smite", true); // silent
    tiers["Lifeb"].nodes.forEach(id=>{ if(id!=="Lifeb01") nodes[id].el.style.display="block"; });
  }

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

  // Refund children first (cascade)
  if(node.children && node.children.length){
    for(const c of node.children){
      if(nodes[c]?.unlocked) refundNode(c, true);
    }
  }
  node.unlocked = false;
  node.el.classList.remove("unlocked");
  tpUsed -= (node.cost||0);
  sealUsed -= (node.seal||0);
  if(tpUsed<0) tpUsed=0;
  if(sealUsed<0) sealUsed=0;

  // If root refunded, hide its subtree
  const idLow = (nodeId||"").toLowerCase();
  if(idLow === "smite01"){
    tiers["Smite"].nodes.forEach(id=>{
      if(id!=="Smite01"){
        nodes[id].el.style.display="none";
        if(nodes[id].unlocked) refundNode(id, true);
      }
    });
  }
  if(idLow === "lifeb01"){
    tiers["Lifeb"].nodes.forEach(id=>{
      if(id!=="Lifeb01"){
        nodes[id].el.style.display="none";
        if(nodes[id].unlocked) refundNode(id, true);
      }
    });
  }

  // Remove from unlock history
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
  if(!svg){
    svg = document.createElementNS("http://www.w3.org/2000/svg","svg");
    svg.setAttribute("id","edgesLayer");
    svg.style.position = "absolute";
    svg.style.left = "0";
    svg.style.top = "0";
    svg.style.width = "5000px";   // ample canvas
    svg.style.height = "5000px";
    svg.style.zIndex = "1";       // under nodes (which are z=10+ in CSS)
    z.appendChild(svg);
  }

  (data.tiers || []).forEach(t => {
    const tId = t.id;
    tiers[tId] = { id: tId, name: t.name, origin: t.origin || {gx:0,gy:0}, nodes: [] };
    const ox = t.origin?.gx ?? 0;
    const oy = t.origin?.gy ?? 0;

(t.nodes || []).forEach(n => {
  const nx = (ox + (n.gx || 0)) * GRID;
  const ny = (oy + (n.gy || 0)) * GRID;

  const el = document.createElement("div");
  el.className = "node";
  el.style.left = `${nx}px`;
  el.style.top = `${ny}px`;
  el.dataset.id = n.id;
  el.dataset.tier = tId;

  // Overlay icon image if defined
  if (n.icon) {
    const img = document.createElement("img");
    img.src = `Skills/${n.icon}`;
    img.alt = n.name || n.id;
    img.className = "node-icon";  // CSS handles size/position
    el.appendChild(img);
  }

  z.appendChild(el);

  nodes[n.id] = { ...n, tierId:tId, el, unlocked:false };
  tiers[tId].nodes.push(n.id);

  // Hide Smite/Lifeb subnodes initially
  if ((tId==="Smite" && n.id!=="Smite01") || (tId==="Lifeb" && n.id!=="Lifeb01")) {
    el.style.display = "none";
  }

  // Hover → sidebar info
  el.addEventListener("mouseenter",()=>{ setSidebarInfo(formatNodeInfo(nodes[n.id])); });
  // Left click → unlock
  el.addEventListener("click",()=>{ activeTierId = tId; unlockNode(n.id); });
  // Right click → refund
  el.addEventListener("contextmenu",(e)=>{ e.preventDefault(); activeTierId = tId; refundNode(n.id); });
});

  });

  computeParents();
  drawEdges();
}

// ---------- Edges ----------
function drawEdges(){
  const svg = document.getElementById("edgesLayer");
  if(!svg) return;
  // clear
  while(svg.firstChild) svg.removeChild(svg.firstChild);

  // draw each parent -> child line
  for(const pid in nodes){
    const p = nodes[pid];
    if(!p.children || !p.children.length) continue;
    const pEl = p.el;
    if(!pEl || !isVisible(pEl)) continue;

    const px = parseFloat(pEl.style.left) + NODE_SIZE/2;
    const py = parseFloat(pEl.style.top) + NODE_SIZE/2;

    for(const cid of p.children){
      const c = nodes[cid];
      if(!c) continue;
      const cEl = c.el;
      if(!cEl || !isVisible(cEl)) continue;

      const cx = parseFloat(cEl.style.left) + NODE_SIZE/2;
      const cy = parseFloat(cEl.style.top) + NODE_SIZE/2;

      const line = document.createElementNS("http://www.w3.org/2000/svg","line");
      line.setAttribute("x1", px);
      line.setAttribute("y1", py);
      line.setAttribute("x2", cx);
      line.setAttribute("y2", cy);
      line.setAttribute("stroke", "#2be58e");
      line.setAttribute("stroke-width", "3");
      line.setAttribute("opacity", p.unlocked ? "1" : "0.5");
      svg.appendChild(line);
    }
  }
}

// ---------- Centering ----------
function centerOnTier(tierId){
  const t = tiers[tierId];
  if (!t || !t.nodes.length) return;
  const firstEl = nodes[t.nodes[0]]?.el;
  centerOnNode(firstEl, 40, true);
  activeTierId = tierId;
}

function centerOnNode(nodeEl, extraYOffset = 40, animate = true){
  if (!nodeEl) return;
  const mainRect = document.querySelector("main").getBoundingClientRect();
  const header = document.querySelector("header");
  const headerH = header ? header.offsetHeight : 0;

  const z = document.getElementById("zoomArea");
  const rectNode = nodeEl.getBoundingClientRect();
  const rectZ = z.getBoundingClientRect();

  const nodeCenterX = (rectNode.left - rectZ.left) + rectNode.width/2;
  const nodeCenterY = (rectNode.top - rectZ.top) + rectNode.height/2;

  const desiredX = mainRect.width / 2;
  const desiredY = headerH + extraYOffset;

  const targetX = desiredX - nodeCenterX * scale;
  const targetY = desiredY - nodeCenterY * scale;

  if (!animate){
    originX = targetX; originY = targetY; applyTransform(); return;
  }

  const sx = originX, sy = originY;
  const duration = 300;
  const t0 = performance.now();
  function step(now){
    const t = Math.min((now - t0)/duration, 1);
    const ease = 1 - Math.pow(1 - t, 3);
    originX = sx + (targetX - sx) * ease;
    originY = sy + (targetY - sy) * ease;
    applyTransform();
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
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
  // repeatedly scan until no progress or resources stop
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
  // Ensure roots visible if applicable
  if(tid==="Smite" && !nodes["Smite01"]?.unlocked){
    unlockNode("Smite01");
  }
  if(tid==="Lifeb" && !nodes["Lifeb01"]?.unlocked){
    unlockNode("Lifeb01");
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

function resetTier(tid, silent=false){
  const t = tiers[tid]; if(!t) return;
  // Refund roots last to ensure cascade
  const rootsLast = [...t.nodes].sort((a,b)=>{
    const aRoot = a.endsWith("01") ? 1 : 0;
    const bRoot = b.endsWith("01") ? 1 : 0;
    return aRoot - bRoot;
  });
  for(const id of rootsLast){
    if(nodes[id].unlocked) refundNode(id, true);
    // also hide subtrees if root
    if(tid==="Smite" && id==="Smite01"){
      tiers["Smite"].nodes.forEach(nid=>{ if(nid!=="Smite01") nodes[nid].el.style.display="none"; });
    }
    if(tid==="Lifeb" && id==="Lifeb01"){
      tiers["Lifeb"].nodes.forEach(nid=>{ if(nid!=="Lifeb01") nodes[nid].el.style.display="none"; });
    }
  }
  if(!silent) updateCounters();
  drawEdges();
}

function resetAll(){
  resetTier("Lifeb", true);
  resetTier("Smite", true);
  resetTier("Verdo", true);
  updateCounters();
  drawEdges();
}

function bindHeaderButtons(){
  $("#goToFirst")?.addEventListener("click", () => { centerOnTier("Verdo"); activeTierId="Verdo"; });
  $("#goToSub1")?.addEventListener("click", () => { centerOnTier("Smite"); activeTierId="Smite"; });
  $("#goToSub2")?.addEventListener("click", () => { centerOnTier("Lifeb"); activeTierId="Lifeb"; });

  $("#maxVerdant")?.addEventListener("click",()=>{ maxTier("Verdo"); });
  $("#maxSmite")?.addEventListener("click",()=>{ maxTier("Smite"); });
  $("#maxLifebloom")?.addEventListener("click",()=>{ maxTier("Lifeb"); });

  $("#resetCur")?.addEventListener("click",()=>{ resetTier(activeTierId); });
  $("#resetAll")?.addEventListener("click",resetAll);

  $("#tpMax")?.addEventListener("input", updateCounters);
  $("#sealMax")?.addEventListener("input", updateCounters);
}

// ---------- Boot ----------
window.addEventListener("load", () => {
  bindLegend();
  bindPanZoom();
  bindHeaderButtons();
  bindClearSidebar();
  applyTransform();

  fetch("merged.json")
    .then(r=>r.json())
    .then(data=>{
      buildFromJSON(data);
      centerOnTier("Verdo");
      updateCounters();
    })
    .catch(err=>console.error("Failed to load merged.json", err));
});
