// ==============================
// BP Star Resonance Talent Engine
// Final Unified Version
// ==============================

// ==============================
// GLOBAL STATE
// ==============================
let allTalents = [];

let talentMap = new Map();
let parentMap = new Map();
let talentById = new Map();

let currentWeaponGroup = null;

let tpUsed = 0;
let sealUsed = 0;

let activeTraversal = new Set();
let pendingImportedBuild = null;
// ==============================
// SPEC STATE
// ==============================

let activeClass = null;activateSpec
let activeSpec  = null;
// ==============================
// NODE TYPE HELPERS
// ==============================

function isSpecNode(talent) {
  return /\bspec\b/i.test(talent.name);
}

// ==============================
// DOM REFERENCES
// ==============================

const zoomArea = document.getElementById("zoomArea");
const svg = document.getElementById("edgesLayer");
const sidebarText = document.querySelector(".sidebar-text");
const tpUsedEl = document.getElementById("tpUsed");
const sealUsedEl = document.getElementById("sealUsed");
const tpMaxEl = document.getElementById("tpMax");
const sealMaxEl = document.getElementById("sealMax");
const nodes = {};
const collapsedSpecs = new Set();
const runtimeParentMap = new Map();
const specContainer =
  document.getElementById("tierButtons");

// TREE POSITION SCALE
// ==============================
const TREE_SCALE = 0.45;
// ==============================
// TRANSFORM SYSTEM (Zoom + Pan)
// ==============================

let scale = 1;
let offsetX = 0;
let offsetY = 0;

offsetX = 200;
offsetY = 100;
applyTransform();

function applyTransform() {
  zoomArea.style.transform =
  "translate(" + offsetX + "px, " +
  offsetY + "px) scale(" +
  scale + ")";
}

// ==============================
// ZOOM (Mouse Wheel)
// ==============================

zoomArea.addEventListener("wheel", e => {
  e.preventDefault();

  const zoomSpeed = 0.1;
  const rect = zoomArea.getBoundingClientRect();

const mouseX = e.clientX - rect.left;
const mouseY = e.clientY - rect.top;

  const zoomFactor = e.deltaY < 0 ? 1 + zoomSpeed : 1 - zoomSpeed;
  const newScale = Math.min(2.5, Math.max(0.5, scale * zoomFactor));

  offsetX -= mouseX * (newScale / scale - 1);
  offsetY -= mouseY * (newScale / scale - 1);

  scale = newScale;
  applyTransform();
});

// ==============================
// DRAG (Mouse)
// ==============================

let isDragging = false;
let startX, startY;

zoomArea.parentElement.addEventListener("mousedown", e => {

  if (e.button !== 0) return;

  isDragging = true;

  startX = e.clientX - offsetX;
  startY = e.clientY - offsetY;
});

document.addEventListener("mousemove", e => {
  if (!isDragging) return;

  offsetX = e.clientX - startX;
  offsetY = e.clientY - startY;

  applyTransform();
});

document.addEventListener("mouseup", () => {
  isDragging = false;
});

// ==============================
// MOBILE PINCH + DRAG
// ==============================

let initialDistance = null;
let lastScale = 1;

zoomArea.addEventListener("touchstart", e => {

  if (e.touches.length === 2) {
    initialDistance = getTouchDistance(e.touches);
    lastScale = scale;
  }

}, { passive: false });

zoomArea.addEventListener("touchmove", e => {

  if (e.touches.length === 2 && initialDistance) {
    e.preventDefault();

    const newDistance = getTouchDistance(e.touches);
    const zoomFactor = newDistance / initialDistance;

    scale = Math.min(2.5, Math.max(0.5, lastScale * zoomFactor));
    applyTransform();
  }

  if (e.touches.length === 1) {
    handleTouchDrag(e);
  }

}, { passive: false });

zoomArea.addEventListener("touchend", () => {
  initialDistance = null;
  isDragging = false;
});

function getTouchDistance(touches) {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

function handleTouchDrag(e) {
  const touch = e.touches[0];

  if (!isDragging) {
    isDragging = true;
    startX = touch.clientX - offsetX;
    startY = touch.clientY - offsetY;
  }

  offsetX = touch.clientX - startX;
  offsetY = touch.clientY - startY;

  applyTransform();
}

// ==============================
// HAMBURGER MENU (Dynamic Safe)
// ==============================

function initHamburgerMenu() {

  const menuToggle = document.getElementById("menuToggle");
  const menu = document.getElementById("menu");

  if (!menuToggle || !menu) return;

  function closeMenu() {
    menu.classList.add("hidden");
    menuToggle.classList.remove("open");
    document.removeEventListener("click", outsideClickHandler);
    document.removeEventListener("keydown", escHandler);
  }

  function outsideClickHandler(e) {
    if (!menu.contains(e.target) && !menuToggle.contains(e.target)) {
      closeMenu();
    }
  }

  function escHandler(e) {
    if (e.key === "Escape") {
      closeMenu();
    }
  }

  menuToggle.addEventListener("click", (e) => {
    e.stopPropagation();
    menu.classList.toggle("hidden");

    if (!menu.classList.contains("hidden")) {
      menuToggle.classList.add("open");
      document.addEventListener("click", outsideClickHandler);
      document.addEventListener("keydown", escHandler);
    } else {
      closeMenu();
    }
  });

  // Event Delegation (important)
  menu.addEventListener("click", (e) => {
    if (e.target.tagName === "A") {
      closeMenu();
    }
  });
}

// ==============================
// INIT
// ==============================

document.addEventListener("DOMContentLoaded", async () => {
	applyTheme("red");

  sealMaxEl.value = 50;

  initHamburgerMenu();

  await loadTalents();

  buildFromJSON(allTalents);

  hideAllNodes();

  buildWeaponMenu(allTalents);
  
  bindClearSidebar();	
	
  loadBuildFromURL();

});

function hideAllNodes() {

  Object.values(nodes).forEach(n => {
    n.el.style.display = "none";
  });

}
// ==============================
// LOAD TALENTS
// ==============================
function buildMaps() {

  talentById.clear();
  talentMap.clear();
  parentMap.clear();

  allTalents.forEach(talent => {

    // runtime lookup
    talentMap.set(talent.Id, talent);

    // raw lookup (optional but useful)
    talentById.set(String(talent.baseId), talent);

  });

  // ---------- build parent map ----------
  allTalents.forEach(talent => {

    talent.children?.forEach(childId => {

      if (!parentMap.has(childId)) {
        parentMap.set(childId, []);
      }

      parentMap.get(childId).push(talent);

    });

  });
}

async function loadTalents() {

  const response = await fetch("talents.json");
  const data = await response.json();

  allTalents = data;

  allTalents.forEach(t => {
    t.currentRank = 0;
  });

  buildMaps();

  buildWeaponMenu(allTalents);
}

  // --------------------------
  // Normalize Talents
  // --------------------------

function normalizeTalents(rawTalents) {

  const tiers = {};
  const nodes = [];

  rawTalents.forEach(t => {

    const tierId =
      t.WeaponGroup === 0
        ? "Base"
        : "WG" + t.WeaponGroup;

    if (!tiers[tierId]) {
      tiers[tierId] = {
        id: tierId,
        name: getClassName(t.WeaponGroup),
        origin: { gx: 0, gy: 0 },
        nodes: [],
        collapsed: tierId !== "Base"
      };
    }

    tiers[tierId].nodes.push({
      id: String(t.Id),
      name: t.name,
      icon: t.icon,
      desc: t.desc,
      gx: t.gx,
      gy: t.gy,
      cost: t.cost,
      seal: t.seal,
      children: t.children?.map(String) || [],
      requiresUnlock: t.requiresUnlock
    });

  });

  return {
    tiers: Object.values(tiers)
  };
}
// ==============================
// BASE TIER HELPER
// ==============================

function getBaseTierId() {

  const base =
    Object.values(nodes)
      .filter(n => n.tierId === "Base")
      .sort((a,b)=> a.gy - b.gy)[0];

  return base?.id || null;
}
  
// ==============================
// BUILD TREE FROM JSON
// ==============================
function getTreeBounds() {

  let maxX = 0;
  let maxY = 0;

  Object.values(nodes).forEach(n => {

    if (!n.el) return;

    const x =
      parseFloat(n.el.style.left || 0)
      + n.el.offsetWidth;

    const y =
      parseFloat(n.el.style.top || 0)
      + n.el.offsetHeight;

    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  });

  return { maxX, maxY };
}
  
function buildFromJSON(talents) {

  // remove ONLY nodes — keep SVG
zoomArea
  .querySelectorAll(".node")
  .forEach(n => n.remove());

  for (const k in nodes)
    delete nodes[k];

  talents.forEach(talent => {

const el = document.createElement("div");
el.className = "node";

const shape = getNodeShape(talent);

if (shape === "small") el.classList.add("size1");
if (shape === "large") el.classList.add("size2");
if (shape === "hex")   el.classList.add("size3");

el.dataset.id = talent.Id;


// ===== FRAME =====
const frame = document.createElement("div");
frame.className = "node-frame";
el.appendChild(frame);


// ===== ICON =====
const img = document.createElement("img");
img.src = "Skills/" + talent.icon;
img.className = "node-icon";
el.appendChild(img);

    // register
    nodes[String(talent.Id)] = {
      ...talent,
      id: String(talent.Id),
      el,
      unlocked: false
    };

    // click
// LEFT CLICK = purchase
el.addEventListener("click", e => {

  const t = nodes[String(talent.Id)];

  if (t.currentRank === 0)
    purchaseTalent(t);
  else
    refundTalent(t);

  updateTreeVisuals();
  drawEdges();
});

// RIGHT CLICK = refund
el.addEventListener("contextmenu", e => {

  e.preventDefault();

  refundTalent(
    nodes[String(talent.Id)]
  );

  updateTreeVisuals();
  drawEdges();
});
    // hover
    el.addEventListener("mouseenter", () => {
      showSidebar(nodes[String(talent.Id)]);
    });

    zoomArea.appendChild(el);

    // positioning
    const w = el.offsetWidth;
    const h = el.offsetHeight;

    el.style.left =
      (talent.gx * TREE_SCALE - w/2) + "px";

    el.style.top =
      (talent.gy * TREE_SCALE - h/2) + "px";
  });


  // ---------- runtime parents ----------
  runtimeParentMap.clear();

  Object.values(nodes).forEach(parent => {

    parent.children?.forEach(childId => {

      if (!runtimeParentMap.has(childId))
        runtimeParentMap.set(childId, []);

      runtimeParentMap
        .get(childId)
        .push(parent);

    });

  });

  updateTreeVisuals();

  setTimeout(drawEdges, 0);
}
	
// ==
// draw edges lines
// ==
function getNodeRadius(node) {

  if (node.el.classList.contains("size1")) return 22;
  if (node.el.classList.contains("size2")) return 32;
  if (node.el.classList.contains("size3")) return 40;

  return 30;
}

function hasParents(node) {
  const p = runtimeParentMap.get(node.id);
  return p && p.length > 0;
}

// Root Identifier
function getClassAndSpecRoots(groupId) {

  const classNodes =
    Object.values(nodes)
      .filter(n =>
        n.WeaponGroup === groupId
      );

  // walk FULL connected graph first
  const connected =
    traverseFrom(classNodes);

  let classRoot = null;
  const specRoots = [];

  connected.forEach(id => {

    const node = nodes[id];

    // ----- BASE ROOT -----
    if (
      node.WeaponGroup === 0 &&
      !hasParents(node)
    ) {
      classRoot = node;
    }

    // ----- SPECS -----
    if (
      node.WeaponGroup === groupId &&
      isSpecNode(node)
    ) {
      specRoots.push(node);
    }

  });

  return {
    classRoots:
      classRoot ? [classRoot] : [],
    specRoots
  };
}

// ==============================
// DYNAMIC WEAPON GROUP MENU
// ==============================

// Connected nodes

function getConnectedTalents(groupId) {

  const allowed = new Set();
  const stack = [];

  // start from selected class
  allTalents.forEach(t => {
    if (t.WeaponGroup === groupId)
      stack.push(t);
  });

  while (stack.length) {

    const t = stack.pop();
    const id = String(t.Id);

    if (allowed.has(id)) continue;
    allowed.add(id);

    // ----- children -----
    t.children?.forEach(cid => {

      const child =
        allTalents.find(x => x.Id == cid);

      if (child)
        stack.push(child);
    });

    // ----- parents -----
    t.parents?.forEach(pid => {

      const parent =
        allTalents.find(x => x.Id == pid);

      if (parent)
        stack.push(parent);
    });

  }

  return allowed;
}

// ==============================
// Max Buttons + Reset Logic
// ==============================
document.getElementById("MaxButton")
?.addEventListener("click", maxCurrentTree);

function maxCurrentTree() {

  if (!currentWeaponGroup) return;

  let changed = true;

  while (changed) {

    changed = false;

    Object.values(nodes).forEach(node => {

      if (node.el.style.display === "none")
        return;

      if (node.currentRank > 0)
        return;

      if (!canUnlock(node))
        return;

      if (
        tpUsed + node.cost >
        parseInt(tpMaxEl.value)
      ) return;

      if (
        sealUsed + node.seal >
        parseInt(sealMaxEl.value)
      ) return;

      // don't auto-pick specs
      if (isSpecNode(node))
        return;

      purchaseTalent(node);
      changed = true;

    });

  }

  updateTreeVisuals();
  drawEdges();
}


document.getElementById("resetCur")
?.addEventListener("click", resetCurrentTree);

function resetCurrentTree() {

  Object.values(nodes).forEach(node => {

    if (node.el.style.display === "none")
      return;

    if (node.currentRank > 0)
      refundTalent(node);

  });

  updateTreeVisuals();
  drawEdges();
}

// ==============================
// LOAD WEAPON GROUP
// ==============================
function loadWeaponGroup(groupId) {
  // ===== RESET RUNTIME =====
  tpUsed = 0;
  sealUsed = 0;
  activeSpec = null;

  Object.values(nodes).forEach(n => {
    n.currentRank = 0;
  });

  updateCounters();

  currentWeaponGroup = groupId;
  activeSpec = null;

  const roots =
  getClassAndSpecRoots(groupId);

const classRoots = roots.classRoots;

const specRoots =
  roots.specRoots.sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  // ----- CLASS GRAPH -----
  const classTraversal =
    traverseFrom(classRoots);

  const baseBottom =
    getBaseTreeBottom(classTraversal);

  const SPEC_GAP = 140;

  specRoots.forEach(spec => {

  const oldY =
    parseFloat(spec.el.style.top);

  const newY =
    baseBottom + SPEC_GAP;

  const dy = newY - oldY;

  // move spec itself
  spec.el.style.top = newY + "px";

  // move ENTIRE specialization subtree
  moveEntireBranch(spec, 0, dy);
});

const theme = getWGTheme(groupId);

updateClassHeader(groupId);
applyWGBackground(groupId);
applyTheme(getWGTheme(groupId));

  // ----- INCLUDE SPECS -----
  const specTraversal =
    traverseFrom(specRoots);

  activeTraversal =
    new Set([
      ...classTraversal,
      ...specTraversal
    ]);

  assignSpecBranches(specRoots);
  alignSpecNodes(specRoots, classRoots);

  // collapse specs FIRST
  Object.values(nodes)
    .filter(n =>
      n.WeaponGroup === groupId &&
      isSpecNode(n)
    )
    .forEach(spec =>
      collapseSpecBranch(spec.id)
    );

  // THEN apply visibility rules
  applySpecVisibility();

  buildSpecButtons();

// ======================
// CENTER CLASS TREE
// ======================
centerOnClassRoot();
	requestAnimationFrame(() => {
  applyImportedBuild();
});
}

function buildWeaponMenu(data) {

  const groups =
    [...new Set(
      data
        .map(t => Number(t.WeaponGroup))
        .filter(g => g !== 0)
    )];

  const menu = document.querySelector("#menu ul");
  menu.innerHTML = "";

  groups
  .sort((a,b)=>
    (CLASS_META[a]?.order ?? 999) -
    (CLASS_META[b]?.order ?? 999)
  )
  .forEach(groupId => {

    const li = document.createElement("li");
    const a = document.createElement("a");

    a.href = "#";
    a.textContent = getClassName(groupId);

    a.addEventListener("click", e => {
      e.preventDefault();
      loadWeaponGroup(groupId);
    });

    li.appendChild(a);
    menu.appendChild(li);
  });
}

// ==============================
// CLASS METADATA
// ==============================

const CLASS_META = {

  1: { name: "Stormblade", order: 4 },
  2: { name: "Frost Mage", order: 6 },
  4: { name: "Wind Knight", order: 3 },
  5: { name: "Verdant Oracle", order: 7 },
  9: { name: "Heavy Guardian", order: 1 },
  11:{ name: "Marksman", order: 5 },
  12:{ name: "Shield Knight", order: 2 },
  13:{ name: "Beat Performer", order: 8 }

};
const CLASS_ICONS = {
  1: "../img/weapon_icon1.png",
  2: "../img/weapon_icon2.png",
  4: "../img/weapon_icon4.png",
  5: "../img/weapon_icon5.png",
  9: "../img/weapon_icon9.png",
  11:"../img/weapon_icon11.png",
  12:"../img/weapon_icon12.png",
  13:"../img/weapon_icon13.png"

};

// ==============================
// WG VISUAL THEMES
// ==============================

const WG_THEME = {

  // ----- RED THEME -----
  1: { theme: "red" },
  2: { theme: "red" },
  4: { theme: "red" },
  11: { theme: "red" },
  

  // ----- BLUE THEME -----
  9: { theme: "blue" },
  12:{ theme: "blue" },

  // ----- GREEN THEME -----
  5: { theme: "green" },
  13: { theme: "green" }

};
function getWGTheme(groupId) {
  return WG_THEME[groupId]?.theme || "red";
}
function applyWGBackground(groupId) {

  document.body.classList.remove(
    "wg1","wg2","wg4","wg5",
    "wg9","wg11","wg12","wg13"
  );

  document.body.classList.add("wg" + groupId);
}

// ==============================
// Header Update
// ==============================
function updateClassHeader(groupId){

  const icon =
    document.getElementById("classIcon");

  const title =
    document.getElementById("classTitle");

  if(icon)
    icon.src =
      CLASS_ICONS[groupId]
      || "../Styles/favicon.png";

  if(title)
    title.textContent =
      getClassName(groupId);
}

// ==============================
// CLASS NAME LOOKUP
// ==============================

function getClassName(id) {
  return CLASS_META[id]?.name || ("Class " + id);
}
// Node Shapes

function getNodeShape(talent) {

  const name = talent.name.toLowerCase();

  // HEX — Specs
  if (/\bspec\b/i.test(talent.name)) {
    return "hex";
  }

  // SMALL — attributes
const ATTRIBUTE_SET = new Set([
  "crit",
  "strength",
  "agility",
  "haste",
  "luck",
  "endurance",
  "intellect"
]);

if (ATTRIBUTE_SET.has(name.trim())) {
  return "small";
}

  if (/\b\w+\s+attack\b/i.test(talent.name)) {
    return "small";
  }

  // LARGE — normal talents
  if (talent.cost >= 1) {
    return "large";
  }

  return "small";
}
// ==============================
// VISUAL STATES
// ==============================

function updateTreeVisuals() {

  Object.values(nodes).forEach(node => {

    const el = node.el;

    if (node.currentRank > 0)
      el.classList.add("unlocked");
    else
      el.classList.remove("unlocked");

  });

}


// =====
// Auto Class Spec Buttons
// =====
  function getSortedSpecs() {

  return Object.values(nodes)
    .filter(n =>
      n.WeaponGroup === currentWeaponGroup &&
      isSpecNode(n)
    )
    .sort((a, b) => {

      const nameA =
        a.name.replace(/\s*spec/i,"").toLowerCase();

      const nameB =
        b.name.replace(/\s*spec/i,"").toLowerCase();

      return nameA.localeCompare(nameB);
    });
}
  
function getWG0Root() {

  return Object.values(nodes).find(node =>
    node.WeaponGroup === 0 &&
    !runtimeParentMap.get(node.id)?.length
  );

}

function createSpecButton(specId, name) {

  const btn = document.createElement("button");
  btn.className = "header-btn";
  btn.textContent = name;

  btn.onclick = () => {

    // CLASS BUTTON → go to WG0 root
    if (specId === "class") {
      centerOnClassRoot();
      return;
    }

    // SPEC BUTTON → normal behavior
    switchSpec(specId);
  };

  specContainer.appendChild(btn);
}

function buildSpecButtons() {

  specContainer.innerHTML = "";

  // ----- CLASS BUTTON -----
  createSpecButton(
    "class",
    getClassName(currentWeaponGroup)
  );

  // ----- FIND SPECS DIRECTLY -----
  getSortedSpecs()
  .forEach(spec => {

      const clean =
        spec.name.replace(/\s*spec/i,"");

      createSpecButton(spec.id, clean);
    });
}

function switchSpec(newSpecId) {

  const spec = nodes[newSpecId];
  if (!spec) return;

  activateSpec(spec);
}


function refundSpecPoints() {

  Object.values(nodes).forEach(node => {

    if (node.tierId !== "Base") {
      node.currentRank = 0;
    }

  });

}
// ==
// Find node 0
// ==
function getTreeRootNode(groupId) {

  // nodes connected to this class
  const connected =
    getConnectedTalents(groupId);

  let bestRoot = null;
  let highestY = Infinity;

  Object.values(nodes).forEach(node => {

    // must be WG0
    if (node.WeaponGroup !== 0)
      return;

    // must be part of this class graph
    if (!connected.has(node.id))
      return;

    // must have NO parents
    const parents =
      runtimeParentMap.get(node.id);

    if (parents && parents.length)
      return;

    // pick visually highest node
    const y =
      parseFloat(node.el.style.top);

    if (y < highestY) {
      highestY = y;
      bestRoot = node;
    }

  });

  return bestRoot;
}

// ==============================
// THEME SYSTEM
// ==============================
function applyTheme(theme) {

  document.body.classList.remove(
    "theme-red",
    "theme-blue",
    "theme-green"
  );

  document.body.classList.add("theme-" + theme);
}

// ==============================
// EDGE DRAWING SYSTEM
// ==============================
function drawEdges() {

  const SVG_NS =
    "http://www.w3.org/2000/svg";

  const svg =
  document.getElementById("edgesLayer");

if (!svg) return;

  svg.innerHTML = "";

  Object.values(nodes).forEach(parent => {

    if (!parent.children) return;

    const px =
      parseFloat(parent.el.style.left)
      + parent.el.offsetWidth / 2;

    const py =
      parseFloat(parent.el.style.top)
      + parent.el.offsetHeight / 2;

    parent.children.forEach(childId => {

      const child = nodes[childId];

      if (
        !child ||
        parent.el.offsetParent === null ||
        child.el.offsetParent === null
      ) return;

      const cx =
        parseFloat(child.el.style.left)
        + child.el.offsetWidth / 2;

      const cy =
        parseFloat(child.el.style.top)
        + child.el.offsetHeight / 2;

      const line =
        document.createElementNS(
          SVG_NS,"line"
        );

      // ===== EDGE TERMINATION FIX =====

const dx = cx - px;
const dy = cy - py;

const dist = Math.hypot(dx, dy);
if (!dist) return;

const nx = dx / dist;
const ny = dy / dist;

const r1 = getNodeRadius(parent);
const r2 = getNodeRadius(child);

// move start/end to node borders
const sx = px + nx * r1;
const sy = py + ny * r1;

const ex = cx - nx * r2;
const ey = cy - ny * r2;

line.setAttribute("x1", sx);
line.setAttribute("y1", sy);
line.setAttribute("x2", ex);
line.setAttribute("y2", ey);

      line.classList.add("edge");

      if (
        parent.currentRank > 0 &&
        child.currentRank > 0
      ) {
        line.classList.add("edge-unlocked");
      } else {
        line.classList.add("edge-locked");
      }

      svg.appendChild(line);
    });

  });
}

// ==
// reveal / collapse
// ==
function revealSpecBranch(specId) {

  const branch = traverseFrom([nodes[specId]]);

  branch.forEach(id => {
    const node = nodes[id];
    if (node) node.el.style.display = "";
  });

  collapsedSpecs.delete(specId);
}

function collapseSpecBranch(specId) {

  const branch = traverseFrom([nodes[specId]]);

  branch.forEach(id => {

    if (id === specId) return; // keep root visible
    if (!activeTraversal.has(id)) return;
    const node = nodes[id];
    if (node)
      node.el.style.display = "none";
  });

  collapsedSpecs.add(specId);
}
function collapseOtherSpecs(activeSpecId) {

  Object.values(nodes)
    .filter(n =>
      n.WeaponGroup === currentWeaponGroup &&
      isSpecNode(n)
    )
    .forEach(spec => {

      if (spec.id !== activeSpecId)
        collapseSpecBranch(spec.id);
    });
}

// ==
// spec stuff
// ==

function applySpecVisibility() {

  const visible = new Set();

  const { classRoots, specRoots } =
    getClassAndSpecRoots(currentWeaponGroup);

  // =========================
  // BASE + CLASS TREE
  // =========================
  traverseVisible(classRoots, visible);

  // =========================
  // SPEC ROOTS ALWAYS VISIBLE
  // =========================
  specRoots.forEach(spec => {
    visible.add(spec.id);
  });

  // =========================
  // ACTIVE SPEC SUBTREE
  // =========================
  if (activeSpec) {

  const activeSpecRoot =
    nodes[activeSpec];

  if (
    activeSpecRoot &&
    activeSpecRoot.currentRank > 0
  ) {

    // reveal ENTIRE specialization branch
    const branch =
      traverseFrom([activeSpecRoot]);

    branch.forEach(id =>
      visible.add(id)
    );
  }
}

  // =========================
  // APPLY VISIBILITY
  // =========================
  Object.values(nodes).forEach(node => {

    node.el.style.display =
      visible.has(node.id)
        ? ""
        : "none";

  });

  drawEdges();
}



function traverseVisible(startNodes, visible) {

  const stack = [...startNodes];

  while (stack.length) {

    const node = stack.pop();

    if (!node || visible.has(node.id))
      continue;

    visible.add(node.id);

    if (!node.children) continue;

    node.children.forEach(id => {
      stack.push(nodes[id]);
    });
  }
}




function canUnlock(talent) {

  // ===== SPEC RULE =====
  if (isSpecNode(talent)) {
    return tpUsed >= 30; // your base-tree requirement
  }

  const parents =
    runtimeParentMap.get(talent.id);

  if (!parents || parents.length === 0)
    return true;

  return parents.some(p => p.currentRank > 0);
}

function hasValidParent(talent) {

  const parents =
    runtimeParentMap.get(talent.id);

  if (!parents || parents.length === 0)
    return true;

  // ===== SPEC BRANCH RULE =====
  if (talent.Spec && talent.Spec === activeSpec)
    return true;

  return parents.some(p => p.currentRank > 0);
}

function validateThresholds() {

  allTalents.forEach(talent => {

    if (talent.currentRank === 0) return;

    const required =
     talent.requiresUnlock?.[0] ?? 0;

    if (tpUsed < required) {

      talent.currentRank = 0;

      tpUsed = Math.max(0, tpUsed - talent.cost);
      sealUsed = Math.max(0, sealUsed - talent.seal);
    }

  });

}

function validateChildren() {

  let changed = true;

  // keep checking until tree stabilizes
  while (changed) {

    changed = false;

    Object.values(nodes).forEach(talent => {

      if (talent.currentRank === 0) return;

      if (!hasValidParent(talent)) {

        talent.currentRank = 0;

        tpUsed =
  Math.max(0, tpUsed - talent.cost);

sealUsed =
  Math.max(0, sealUsed - talent.seal);

        changed = true;
      }

    });

  }

  updateCounters();
}

// ==
// its late af
// ==
function moveEntireBranch(rootNode, dx, dy) {

  const branch = traverseFrom([rootNode]);

  branch.forEach(id => {

    const node = nodes[id];
    if (!node || node === rootNode) return;

    const left =
      parseFloat(node.el.style.left);

    const top =
      parseFloat(node.el.style.top);

    node.el.style.left =
      (left + dx) + "px";

    node.el.style.top =
      (top + dy) + "px";
  });
}

function alignSpecNodes(specRoots, classRoots) {

  if (!classRoots.length || specRoots.length !== 2)
    return;

  const classRoot = classRoots[0];

  // midpoint X = class root center
  const anchorX =
    parseFloat(classRoot.el.style.left) +
    classRoot.el.offsetWidth / 2;

  // keep specs on their existing row
  const anchorY =
    parseFloat(specRoots[0].el.style.top);

  const OFFSET = 65; // plus or minus distance

  const positions = [
    anchorX - OFFSET,
    anchorX + OFFSET
  ];

  specRoots.forEach((spec, i) => {

  const oldX =
    parseFloat(spec.el.style.left) +
    spec.el.offsetWidth / 2;

  const oldY =
    parseFloat(spec.el.style.top);

  const newX = positions[i];
  const newY = anchorY;

  const dx = newX - oldX;
  const dy = newY - oldY;

  // move spec
  spec.el.style.left =
    (newX - spec.el.offsetWidth/2) + "px";

  spec.el.style.top =
    newY + "px";

  // move entire subtree
  moveEntireBranch(spec, dx, dy);
});

  // redraw edges AFTER movement
  requestAnimationFrame(drawEdges);
}

function getBaseTreeBottom(classTraversal) {

  let maxY = -Infinity;

  classTraversal.forEach(id => {

    const node = nodes[id];
    if (!node) return;

    const y =
      parseFloat(node.el.style.top);

    if (y > maxY) maxY = y;
  });

  return maxY;
}
// ==============================
// TALENT LOGIC
// ==============================

function toggleTalent(talent) {
  talent.currentRank > 0 ? refundTalent(talent) : purchaseTalent(talent);
}

function purchaseTalent(talent) {

  if (!canUnlock(talent)) return;
	  
function refundSpecBranch(specId) {

  Object.values(nodes).forEach(node => {

    // refund spec itself
    if (node.id === specId) {
      node.currentRank = 0;
      return;
    }

    // refund everything belonging to it
    if (node.Spec === specId &&
        node.currentRank > 0) {

      tpUsed -= node.cost;
      sealUsed -= node.seal;

      node.currentRank = 0;
    }

  });

}

  // ======================
  // SPEC PURCHASE
  // ======================
if (isSpecNode(talent)) {
	
if (activeSpec === talent.id)
  return;
  // =========================
  // SWITCHING SPECS
  // =========================
  if (activeSpec &&
      activeSpec !== talent.id) {

    refundSpecBranch(activeSpec);
  }

  if (tpUsed + talent.cost > parseInt(tpMaxEl.value)) return;
  if (sealUsed + talent.seal > parseInt(sealMaxEl.value)) return;

  tpUsed += talent.cost;
  sealUsed += talent.seal;

  talent.currentRank = 1;

  activateSpec(talent);

  updateCounters();
  updateTreeVisuals();
  drawEdges();

  validateThresholds();
  validateChildren();

  return;
}

  // ======================
  // NORMAL TALENT PURCHASE
  // ======================
  if (tpUsed + talent.cost > parseInt(tpMaxEl.value)) return;
  if (sealUsed + talent.seal > parseInt(sealMaxEl.value)) return;

  tpUsed += talent.cost;
  sealUsed += talent.seal;

  talent.currentRank = 1;

  updateCounters();
  updateTreeVisuals();
  drawEdges();

  validateThresholds();
  validateChildren();
}

  // ======================
  // SPEC SELECTION
  // ======================
function activateSpec(talent) {

  if (!isSpecNode(talent)) return;

  // mark unlocked
  talent.currentRank = 1;

  activeSpec = talent.id;

  collapseOtherSpecs(talent.id);
  revealSpecBranch(talent.id);

  applySpecVisibility();
  updateTreeVisuals();

  centerOnNode(talent.id);
  drawEdges();
}
function deactivateSpec(talent) {

  if (!isSpecNode(talent)) return;

  talent.currentRank = 0;

  collapseSpecBranch(talent.id);

  activeSpec = null;

  applySpecVisibility();
  updateTreeVisuals();
  drawEdges();
}


function refundTalent(talent) {

  if (talent.currentRank === 0) return;

  if (isSpecNode(talent)) {
    deactivateSpec(talent);
    return;
  }

  talent.currentRank = 0;

  tpUsed -= talent.cost;
  sealUsed -= talent.seal;

  updateCounters();
  updateTreeVisuals();
  drawEdges();
  validateThresholds();
  validateChildren();
}
// ==============================
// Node Visibility 
// ==============================

function traverseFrom(startNodes) {

  const visited = new Set();
  const stack = [...startNodes];

  while (stack.length) {

    const node = stack.pop();
    if (!node || visited.has(node.id))
      continue;

    visited.add(node.id);

    // children
    node.children?.forEach(cid =>
      stack.push(nodes[cid])
    );

    // parents
    runtimeParentMap
      .get(node.id)
      ?.forEach(p => stack.push(p));
  }

  return visited;
}
// ==============================
// SPEC BRANCH DETECTION
// ==============================
function assignSpecBranches(specRoots) {

  // clear old tags
  Object.values(nodes)
    .forEach(n => delete n.Spec);

  specRoots.forEach(spec => {

    const branch =
      traverseFrom([spec]);

    branch.forEach(id => {

      if (id === spec.id) return;

      const node = nodes[id];
      if (!node) return;

      node.Spec = spec.id;
    });

  });

}
	
// ===================
// CAMERA RESET
// ===================
function resetCamera() {

  scale = 1;

  offsetX = 200;
  offsetY = 100;

  applyTransform();
}	
function centerOnClassRoot() {

  const root =
    getTreeRootNode(currentWeaponGroup);

  if (!root) return;

  resetCamera();
  centerOnNode(root.id);
}	
// ===================
// Class Root center
// ===================

function centerOnNode(id) {

  const node = nodes[id];
  if (!node) return;

  const rect =
    zoomArea.parentElement.getBoundingClientRect();

  const nx =
    parseFloat(node.el.style.left)
    + node.el.offsetWidth/2;

  const ny =
    parseFloat(node.el.style.top)
    + node.el.offsetHeight/2;

  offsetX = rect.width/2 - nx*scale;
  offsetY = rect.height/6 - ny*scale;

  applyTransform();
}
// ==============================
// SIDEBAR
// ==============================

function showSidebar(talent) {

  setSidebarPreview(talent.icon);

  setSidebarInfo(
  '<div class="talent-detail">' +
    '<h3 style="color:#ffd700">' +
      talent.name +
    '</h3>' +

    '<div class="talent-desc">' +
      talent.desc +
    '</div>' +

    '<div style="margin-top:10px">' +
      '<span style="color:#6cf">Talent Cost:</span> ' +
      talent.cost + '<br>' +

      '<span style="color:#f66">Seal Cost:</span> ' +
      talent.seal +
    '</div>' +
  '</div>'
);
}


function setSidebarInfo(html) {
  sidebarText.innerHTML =
    html || "No Talent Selected";
}

function setSidebarPreview(icon) {

  const img =
    document.getElementById("hoverPreview");

  if (!img) return;

  if (!icon) {
    img.style.display = "none";
    img.src = "";
    return;
  }

  img.src = "Skills/" + icon;
  img.style.display = "block";
}

function bindClearSidebar(){

  const btn =
    document.getElementById("clearSidebar");

  if(!btn) return;

  btn.addEventListener("click", () => {

    setSidebarInfo("");
    setSidebarPreview(null);

  });
}
// ==============================
// RESET
// ==============================

function resetAll() {

  tpUsed = 0;
  sealUsed = 0;
  activeSpec = null;

  Object.values(nodes).forEach(node => {
    node.currentRank = 0;
  });

  applySpecVisibility();
  updateTreeVisuals();
  updateCounters();
  drawEdges();
}

document.getElementById("resetAll")
  .addEventListener("click", resetAll);

// ==============================
// COUNTERS
// ==============================

function updateCounters() {
  tpUsedEl.textContent = tpUsed;
  sealUsedEl.textContent = sealUsed;
}

// ==============================
// EXPORT BUILD (Shareable URL)
// ==============================

document.getElementById("exportBuild")
  ?.addEventListener("click", exportBuild);

function exportBuild() {

  if (!currentWeaponGroup) return;

  const unlocked =
  Object.values(nodes)
    .filter(n => n.currentRank > 0)
    .map(n => Number(n.id).toString(36))
    .join(".");

  const params = new URLSearchParams();

  params.set("wg", currentWeaponGroup);
  params.set("b", unlocked);

  const url =
  location.origin +
  location.pathname +
  "?" +
  params.toString();

  navigator.clipboard.writeText(url);

  showToast("Build URL copied!");
}

// Load URL

function loadBuildFromURL() {

  const params =
    new URLSearchParams(window.location.search);

  const wg =
    parseInt(params.get("wg"));

  const build =
  params.get("b");

  if (!wg) return;

  setTimeout(() => loadWeaponGroup(wg), 0);

  if (!build) return;

  pendingImportedBuild =
  build
    .split(".")
    .map(v => parseInt(v, 36).toString());
}
function applyImportedBuild() {

  if (!pendingImportedBuild) return;

  const ids = pendingImportedBuild;
  pendingImportedBuild = null;

  let changed = true;

  // keep unlocking until stable
  while (changed) {

    changed = false;

    ids.forEach(id => {

      const node = nodes[id];
      if (!node) return;
      if (node.currentRank > 0) return;

      if (!canUnlock(node)) return;

      purchaseTalent(node);
      changed = true;

    });

  }

updateTreeVisuals();
drawEdges();


requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    centerOnClassRoot();
  });
});
}

// ==
// toasty
// ==

function showToast(msg) {

  let toast =
    document.getElementById("toast");

  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast";

    toast.style.position = "fixed";
    toast.style.bottom = "20px";
    toast.style.left = "50%";
    toast.style.transform = "translateX(-50%)";
    toast.style.padding = "10px 18px";
    toast.style.background = "#111";
    toast.style.color = "#fff";
    toast.style.borderRadius = "6px";
    toast.style.zIndex = 9999;
    toast.style.opacity = 0;

    document.body.appendChild(toast);
  }

  toast.textContent = msg;
  toast.style.opacity = 1;

  setTimeout(() => {
    toast.style.opacity = 0;
  }, 1800);
}