// ==============================
// BP Star Resonance Talent Engine
// Final Unified Version
// ==============================

// ==============================
// GLOBAL STATE
// ==============================
let allTalents = [];
let allDescriptions = [];
let descriptionById = new Map();

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

let activeClass = null;
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
  await loadDescriptions();

  buildFromJSON(allTalents);

  hideAllNodes();

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

  if (!response.ok) {
    throw new Error(
      `Failed to load talents.json: ${response.status} ${response.statusText}`
    );
  }

  const data = await response.json();

  // talents.json is an object keyed by talent ID, for example:
  // { "1129002": { "Id": 1129002, ... }, "1129003": { ... } }
  // Convert its values into the flat array expected by this engine.
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    console.error("Unexpected talents.json structure:", data);
    throw new TypeError(
      "Expected talents.json to be an object keyed by talent ID."
    );
  }

  allTalents = Object.values(data);

  // Validate entries before functions such as buildMaps() use them.
  if (
    !allTalents.every(
      talent =>
        talent &&
        typeof talent === "object" &&
        !Array.isArray(talent) &&
        "Id" in talent
    )
  ) {
    console.error("Invalid talent data in talents.json:", data);
    throw new TypeError(
      "talents.json contains an invalid talent entry."
    );
  }

  allTalents.forEach(talent => {
    talent.currentRank = 0;
  });

  buildMaps();
  buildWeaponMenu(allTalents);
}

async function loadDescriptions() {
  const response = await fetch("desc.json");

  if (!response.ok) {
    throw new Error(
      `Failed to load desc.json: ${response.status} ${response.statusText}`
    );
  }

  const data = await response.json();
  descriptionById.clear();

  // desc.json may be an object keyed by description ID or an array of records.
  const entries = Array.isArray(data)
    ? data.map((record, index) => [String(record?.Id ?? record?.ID ?? index), record])
    : Object.entries(data || {});

  allDescriptions = entries
    .filter(([, record]) => record && typeof record === "object")
    .map(([key, record]) => {
      const id = String(record.Id ?? record.ID ?? key);
      return {
        ...record,
        Id: id,
        name: record.Name ?? record.name ?? record.Title ?? record.title ?? `Description ${id}`,
        desc: record.Description ?? record.description ?? record.desc ?? ""
      };
    });

  allDescriptions.forEach(description => {
    descriptionById.set(String(description.Id), description);
  });
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

  1: { name: "Stormblade", order: 5 },
  2: { name: "Frost Mage", order: 7 },
<<<<<<< HEAD
  3: { name: "Twin Striker", order: 4 },
=======
  3: { name: "Twin Axe", order: 4 },
>>>>>>> origin/main
  4: { name: "Wind Knight", order: 3 },
  5: { name: "Verdant Oracle", order: 8 },
  9: { name: "Heavy Guardian", order: 1 },
  11:{ name: "Marksman", order: 6 },
  12:{ name: "Shield Knight", order: 2 },
  13:{ name: "Beat Performer", order: 9 }

};
const CLASS_ICONS = {
  1: "../img/weapon_icon1.png",
  2: "../img/weapon_icon2.png",
  3: "../img/weapon_icon3.png",
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
  3: { theme: "red" },
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
    "wg1","wg2","wg3","wg4","wg5",
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




function getRequiredTP(talent) {
  const raw = talent?.requiresUnlock;
  if (raw == null) return 0;
  const values = Array.isArray(raw) ? raw : [raw];
  return values.reduce((max, value) => {
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(max, n) : max;
  }, 0);
}

// A talent is gated by the amount of TP spent BEFORE buying that talent.
function meetsTPRequirement(talent) {
  const required = getRequiredTP(talent);
  return (tpUsed - (talent.currentRank > 0 ? Number(talent.cost || 0) : 0)) >= required;
}

function canUnlock(talent) {
  if (!talent) return false;
  if (isSpecNode(talent) && tpUsed < 30) return false;
  if (tpUsed < getRequiredTP(talent)) return false;

  const parents = runtimeParentMap.get(String(talent.id ?? talent.Id));
  if (!parents || parents.length === 0) return true;
  return parents.some(parent => parent.currentRank > 0);
}

function hasValidParent(talent) {
  const parents = runtimeParentMap.get(String(talent.id ?? talent.Id));
  if (!parents || parents.length === 0) return true;
  // A node remains valid if ANY one of its parents is still unlocked.
  return parents.some(parent => parent.currentRank > 0);
}

// Refund invalid nodes until the graph and TP thresholds stabilize. This is
// deliberately evaluated against `nodes`, not `allTalents`, because the live
// ranks are stored on the runtime node objects.
function validateThresholds() {
  let changed = true;
  while (changed) {
    changed = false;
    for (const talent of Object.values(nodes)) {
      if (talent.currentRank <= 0 || isSpecNode(talent)) continue;
      if (!meetsTPRequirement(talent)) {
        talent.currentRank = 0;
        tpUsed = Math.max(0, tpUsed - Number(talent.cost || 0));
        sealUsed = Math.max(0, sealUsed - Number(talent.seal || 0));
        changed = true;
      }
    }
  }
}

function validateChildren() {
  let changed = true;
  while (changed) {
    changed = false;
    for (const talent of Object.values(nodes)) {
      if (talent.currentRank <= 0) continue;
      if (isSpecNode(talent)) {
        if (tpUsed < 30) {
          talent.currentRank = 0;
          tpUsed = Math.max(0, tpUsed - Number(talent.cost || 0));
          sealUsed = Math.max(0, sealUsed - Number(talent.seal || 0));
          if (activeSpec === talent.id) activeSpec = null;
          changed = true;
        }
        continue;
      }
      if (!hasValidParent(talent) || !meetsTPRequirement(talent)) {
        talent.currentRank = 0;
        tpUsed = Math.max(0, tpUsed - Number(talent.cost || 0));
        sealUsed = Math.max(0, sealUsed - Number(talent.seal || 0));
        changed = true;
      }
    }
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

function refundSpecBranch(specId) {
  for (const node of Object.values(nodes)) {
    if (node.id === specId || node.Spec === specId) {
      if (node.currentRank > 0) {
        tpUsed = Math.max(0, tpUsed - Number(node.cost || 0));
        sealUsed = Math.max(0, sealUsed - Number(node.seal || 0));
        node.currentRank = 0;
      }
    }
  }
}

function purchaseTalent(talent) {
  if (!talent || talent.currentRank > 0 || !canUnlock(talent)) return;

  const cost = Number(talent.cost || 0);
  const seal = Number(talent.seal || 0);
  const tpMax = Number.parseInt(tpMaxEl?.value, 10);
  const sealMax = Number.parseInt(sealMaxEl?.value, 10);
  if (tpUsed + cost > (Number.isFinite(tpMax) ? tpMax : Infinity)) return;
  if (sealUsed + seal > (Number.isFinite(sealMax) ? sealMax : Infinity)) return;

  if (isSpecNode(talent)) {
    if (activeSpec === talent.id) return;
    if (activeSpec && activeSpec !== talent.id) refundSpecBranch(activeSpec);
  }

tpUsed += cost;
sealUsed += seal;
talent.currentRank = 1;

// Mark this as the most recently unlocked talent
document.querySelectorAll(".node.last-unlocked")
  .forEach(node => node.classList.remove("last-unlocked"));

talent.el.classList.add("last-unlocked");

  if (isSpecNode(talent)) activateSpec(talent);

  validateThresholds();
  validateChildren();
  updateCounters();
  updateTreeVisuals();
  applySpecVisibility();
  drawEdges();
}

function refundTalent(talent) {
  if (!talent || talent.currentRank <= 0) return;

  if (isSpecNode(talent)) {
    refundSpecBranch(talent.id);
    if (activeSpec === talent.id) activeSpec = null;
    collapseSpecBranch(talent.id);
    applySpecVisibility();
    updateCounters();
    updateTreeVisuals();
    drawEdges();
    validateThresholds();
    validateChildren();
    return;
  }

  talent.currentRank = 0;
  talent.el.classList.remove("last-unlocked");
  tpUsed = Math.max(0, tpUsed - Number(talent.cost || 0));
  sealUsed = Math.max(0, sealUsed - Number(talent.seal || 0));

  // Repeated validation refunds descendants only when they have no other
  // unlocked parent, or when their TP threshold is no longer satisfied.
  validateThresholds();
  validateChildren();
  updateCounters();
  updateTreeVisuals();
  drawEdges();
}

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

  const description = renderTalentDescription(talent.desc || "", talent);
  const theme = getWGTheme(currentWeaponGroup);
  const sealImage = `img/aseal_${theme}.png`;

  setSidebarInfo(
    '<div class="talent-detail">' +
      '<h3 class="talent-detail-heading">' + escapeTalentHtml(talent.name || "") + '</h3>' +
      '<div class="talent-desc" data-talent-id="' + escapeTalentHtml(talent.Id ?? talent.ID ?? talent.id ?? "") + '" data-talent-name="' + escapeTalentHtml(talent.name || "") + '">' + description + '</div>' +
      '<div class="talent-cost">' +
        '<div class="talent-cost-label">Cost:</div>' +
        '<div class="talent-cost-row">' +
          '<div class="talent-cost-item"><img class="talent-cost-icon" src="' + sealImage + '" alt="Seals"><span>' + escapeTalentHtml(talent.seal ?? 0) + '</span></div>' +
          '<div class="talent-cost-item"><img class="talent-cost-icon" src="img/talentp.png" alt="Talent Points"><span>' + escapeTalentHtml(talent.cost ?? 0) + '</span></div>' +
        '</div>' +
      '</div>' +
    '</div>'
  );
}

// Escape text from the JSON before inserting it into the sidebar or tooltip.
function escapeTalentHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderStyledDescriptionText(value) {
  return renderTalentMarkup(String(value ?? ""));
}

// Render the game's description markup safely while preserving line breaks,
// supported style colors, common inline HTML, and clickable linktext references.
function renderTalentMarkup(source) {
  const tokenPattern = /<linktext=(\d+)>([\s\S]*?)<\/linktext>|<style="([^"]+)">([\s\S]*?)<\/style>|<br\s*\/?>|<\/?(?:b|strong|i|em|u|sup|sub)>|<[^>]*>/gi;
  let html = "";
  let lastIndex = 0;
  let match;

  while ((match = tokenPattern.exec(source)) !== null) {
    html += escapeTalentHtml(source.slice(lastIndex, match.index));
    const token = match[0];

    if (match[1] !== undefined) {
      const skillId = String(match[1]);
      const innerHtml = renderTalentMarkup(match[2]);
      const plainName = match[2].replace(/<[^>]*>/g, "").trim();
      html += '<a href="#" class="talent-desc-link" data-skill-id="' +
        escapeTalentHtml(skillId) + '" data-skill-name="' +
        escapeTalentHtml(plainName) + '">' + innerHtml + '</a>';
    } else if (match[3] !== undefined) {
      const styleName = match[3].toLowerCase();
      const innerHtml = renderTalentMarkup(match[4]);
      if (styleName === "accent-gn") {
        html += '<span class="desc-text">' + innerHtml + '</span>';
      } else if (styleName === "magic" || styleName === "physical") {
        html += '<span class="desc-dmg">' + innerHtml + '</span>';
      } else {
        // Preserve the style name as a data attribute so CSS can map game colors.
        html += '<span class="desc-style" data-desc-style="' +
          escapeTalentHtml(match[3]) + '">' + innerHtml + '</span>';
      }
    } else if (/^<br\s*\/?\s*>$/i.test(token)) {
      html += "<br>";
    } else if (/^<\/?(?:b|strong|i|em|u|sup|sub)>$/i.test(token)) {
      html += token.toLowerCase();
    }
    // Any other tag is intentionally stripped, rather than shown literally.
    lastIndex = tokenPattern.lastIndex;
  }

  html += escapeTalentHtml(source.slice(lastIndex));
  // Support literal newline characters in addition to <br> tags.
  return html.replace(/\r\n?|\n/g, "<br>");
}

function getTalentByDescriptionId(id, linkedName = "") {
  const wanted = String(id ?? "").trim();

  // desc.json is the source of linked description names and description text.
  const descriptionRecord = descriptionById.get(wanted);
  if (descriptionRecord) return descriptionRecord;

  const normalizeName = value => String(value || "")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/s$/, "");

  const byExactId = allTalents.find(talent => String(talent.Id) === wanted);
  if (byExactId) return byExactId;

  const wantedName = normalizeName(linkedName);
  if (wantedName) {
    const byExactName = allTalents.find(talent => normalizeName(talent.name) === wantedName);
    if (byExactName) return byExactName;
  }

  const byTalentId = allTalents.filter(talent => String(talent.TalentId) === wanted);
  if (byTalentId.length === 1) return byTalentId[0];

  return null;
}

function getLinkedTalentReferences(description) {
  const references = [];
  const seenIds = new Set();
  const pattern = /<linktext=(\d+)>([\s\S]*?)<\/linktext>/gi;
  let match;

  while ((match = pattern.exec(String(description || ""))) !== null) {
    const id = String(match[1]);
    const name = match[2].replace(/<[^>]*>/g, "").trim();
    if (!seenIds.has(id)) {
      seenIds.add(id);
      references.push({ id, name });
    }
  }

  return references;
}

function renderLinkedTalentSection(talent) {
  if (!talent) return "";
  const name = talent.name || talent.Name || "Unnamed Talent";
  const description = talent.desc ?? talent.Description ?? talent.description ?? "";
  const desc = renderTalentDescription(description, talent);

  return '<section class="tooltip-talent-section" data-description-id="' + escapeTalentHtml(talent.Id ?? talent.ID ?? "") + '">' +
    '<div class="tooltip-heading">' + escapeTalentHtml(name) +
    ' <span class="tooltip-skill-id">(#' + escapeTalentHtml(talent.Id ?? talent.ID ?? "?") + ')</span></div>' +
    '<div class="tooltip-description">' + (desc || "No description available.") + '</div>' +
    '</section>';
}

function renderTalentDescription(description, talent) {
  return renderTalentMarkup(String(description || ""));
}

// Collect every unique description reachable from the selected link. A visited
// ID set prevents duplicate entries and also stops circular link references.
function collectUniqueLinkedDescriptions(rootTalent) {
  if (!rootTalent) return [];

  const result = [];
  const visited = new Set();
  const queue = [rootTalent];

  while (queue.length) {
    const current = queue.shift();
    if (!current) continue;

    const id = String(current.Id ?? current.ID ?? "");
    if (id && visited.has(id)) continue;
    if (id) visited.add(id);
    result.push(current);

    const description = current.desc ?? current.Description ?? current.description ?? "";
    for (const reference of getLinkedTalentReferences(description)) {
      if (visited.has(String(reference.id))) continue;
      const linked = getTalentByDescriptionId(reference.id, reference.name);
      if (linked) queue.push(linked);
    }
  }

  return result;
}

function collectUniqueLinkedDescriptionsFromReferences(references) {
  const result = [];
  const visited = new Set();
  const queue = [...(references || [])];
  while (queue.length) {
    const reference = queue.shift();
    if (!reference) continue;
    const id = String(reference.id ?? "");
    if (!id || visited.has(id)) continue;
    visited.add(id);
    const linked = getTalentByDescriptionId(id, reference.name);
    if (!linked) continue;
    result.push(linked);
    const description = linked.desc ?? linked.Description ?? linked.description ?? "";
    for (const nested of getLinkedTalentReferences(description)) {
      if (!visited.has(String(nested.id))) queue.push(nested);
    }
  }
  return result;
}

function getTalentSkillTooltip() {
  let tooltip = document.getElementById("talentSkillTooltip");
  if (tooltip) return tooltip;

  tooltip = document.createElement("div");
  tooltip.id = "talentSkillTooltip";
  tooltip.setAttribute("role", "dialog");
  tooltip.setAttribute("aria-label", "Talent Details");

  // Keep the popup independent of the talent tree's zoom and pan.
  Object.assign(tooltip.style, {
    position: "fixed",
    display: "none",
    zIndex: "10000",
    maxHeight: "calc(100vh - 16px)",
    overflow: "hidden",
    boxSizing: "border-box",
    flexDirection: "column"
  });

  // Fixed heading bar with a close button.
  const header = document.createElement("div");
  header.className = "tooltip-heading tooltip-popup-header";

  const headerTitle = document.createElement("span");
  headerTitle.textContent = "Linked Talent Descriptions";

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "tooltip-close";
  closeButton.textContent = "×";
  closeButton.setAttribute("aria-label", "Close tooltip");
  closeButton.title = "Close";

  Object.assign(closeButton.style, {
    marginLeft: "auto",
    padding: "0 6px",
    border: "none",
    background: "transparent",
    color: "inherit",
    fontSize: "24px",
    fontWeight: "bold",
    lineHeight: "1",
    cursor: "pointer",
    flexShrink: "0"
  });

  header.appendChild(headerTitle);
  header.appendChild(closeButton);

  const content = document.createElement("div");
  content.className = "tooltip-popup-content";

  Object.assign(content.style, {
    overflowY: "auto",
    overflowX: "hidden",
    minHeight: "0",
    flex: "1 1 auto",
    overscrollBehavior: "contain",
    overflowWrap: "anywhere",
    WebkitOverflowScrolling: "touch"
  });

  tooltip.appendChild(header);
  tooltip.appendChild(content);
  document.body.appendChild(tooltip);

  function closeTooltip() {
    tooltip.style.display = "none";
  }

  // X button closes the popup.
  closeButton.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    closeTooltip();
  });

  // Clicking anywhere inside the popup must not trigger outside-click logic.
  tooltip.addEventListener("click", event => {
    event.stopPropagation();

    const link = event.target.closest(".talent-desc-link");
    if (!link) return;

    event.preventDefault();
    openTalentSkillTooltip(link);
  });

  // Close only when clicking outside the popup.
  document.addEventListener("click", event => {
    if (
      tooltip.style.display !== "none" &&
      !tooltip.contains(event.target)
    ) {
      closeTooltip();
    }
  });

  // Escape closes the popup.
  document.addEventListener("keydown", event => {
    if (
      event.key === "Escape" &&
      tooltip.style.display !== "none"
    ) {
      closeTooltip();
    }
  });

  // IMPORTANT:
  // Do not add a window scroll listener that hides the tooltip.
  // Scrolling inside the popup must remain possible.

  return tooltip;
}
function openTalentSkillTooltip(clickedLink) {
  if (!clickedLink) return;

  const skillId = String(clickedLink.dataset?.skillId ?? "");
  const skillName =
    clickedLink.dataset?.skillName ||
    clickedLink.textContent?.trim() ||
    "";

  const tooltip = getTalentSkillTooltip();
  const content = tooltip.querySelector(".tooltip-popup-content");

  const sourceDesc = clickedLink.closest?.(".talent-desc");
  const sourceId = sourceDesc?.dataset?.talentId;

  const sourceTalent = sourceId
    ? allTalents.find(
        t => String(t.Id ?? t.ID ?? t.id ?? "") === String(sourceId)
      )
    : null;

  let entries = [];

  if (sourceTalent) {
    const refs = getLinkedTalentReferences(
      sourceTalent.desc ??
      sourceTalent.Description ??
      sourceTalent.description ??
      ""
    );

    entries = collectUniqueLinkedDescriptionsFromReferences(refs);
  } else {
    const linked = getTalentByDescriptionId(skillId, skillName);

    if (linked) {
      entries = collectUniqueLinkedDescriptions(linked);
    }
  }

  if (entries.length) {
    content.innerHTML = entries
      .map(renderLinkedTalentSection)
      .join("");
  } else {
    content.innerHTML =
      '<div class="tooltip-heading">' +
        escapeTalentHtml(skillName || "Linked skill") +
      '</div>' +
      '<div class="tooltip-description">' +
        'No matching talent description found for ID ' +
        escapeTalentHtml(skillId || "?") +
      '.</div>';
  }

  // Reset scroll when opening a new set of descriptions.
  content.scrollTop = 0;

  // Display as a flex container so the header stays fixed above the content.
  tooltip.style.display = "flex";
  tooltip.style.left = "0px";
  tooltip.style.top = "0px";

  const sidebarTextRect =
    sidebarText?.getBoundingClientRect() ??
    clickedLink.getBoundingClientRect();

  const sidebarControl = document.querySelector(
    ".sidebar-control, .sidebar-controls"
  );

  const sidebarControlRect = sidebarControl
    ? sidebarControl.getBoundingClientRect()
    : sidebarTextRect;

  const margin = 8;
  const maxHeight = window.innerHeight - margin * 2;

  tooltip.style.maxHeight = maxHeight + "px";
  tooltip.style.width = "500px";
  tooltip.style.maxWidth = `calc(100vw - ${margin * 2}px)`;

  // Measure the popup after the content has been inserted.
  const tipRect = tooltip.getBoundingClientRect();

  let left = sidebarTextRect.left - tipRect.width - margin;

  if (left < margin) {
    left = sidebarTextRect.right + margin;
  }

  // Keep the entire popup within the viewport.
  left = Math.max(
    margin,
    Math.min(left, window.innerWidth - tipRect.width - margin)
  );

  let top = Math.max(margin, sidebarControlRect.top);

  if (top + tipRect.height > window.innerHeight - margin) {
    top = Math.max(
      margin,
      window.innerHeight - tipRect.height - margin
    );
  }

  tooltip.style.left = left + "px";
  tooltip.style.top = top + "px";
}


// Delegated sidebar handler: works for dynamically replaced sidebar HTML.
if (sidebarText && !sidebarText.dataset.tooltipDelegationBound) {
  sidebarText.dataset.tooltipDelegationBound = "true";
  sidebarText.addEventListener("click", event => {
    const link = event.target.closest?.(".talent-desc-link");
    if (!link) return;
    event.preventDefault();
    event.stopPropagation();
    openTalentSkillTooltip(link);
  });
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


 // ==============================
 // COMPACT BUILD URL EXPORT / IMPORT
 // ==============================

// Create a stable list of IDs for the selected weapon group's
// connected talent tree, including connected WG0/base talents.
function getCanonicalBuildIds(weaponGroup) {
  const connectedIds = getConnectedTalents(Number(weaponGroup));

  return allTalents
    .filter(t => connectedIds.has(String(t.Id)))
    .map(t => Number(t.Id))
    .filter(Number.isSafeInteger)
    .filter((id, index, arr) => arr.indexOf(id) === index)
    .sort((a, b) => a - b);
}

// Convert bytes to URL-safe Base64.
function bytesToBase64Url(bytes) {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlToBytes(value) {
  const base64 = value
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const binary = atob(
    base64 + "=".repeat((4 - base64.length % 4) % 4)
  );

  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

// Pack the unlocked talents into one bit per talent.
// Select whichever representation is shorter.
function encodeBuild(weaponGroup, unlockedIds) {
  const ids = getCanonicalBuildIds(weaponGroup);
  const bytes = new Uint8Array(Math.ceil(ids.length / 8));
  const unlocked = new Set(unlockedIds.map(Number));
  const indexById = new Map(ids.map((id, index) => [id, index]));

  for (const id of unlocked) {
    const index = indexById.get(id);

    if (index === undefined) {
      throw new Error(
        "Unlocked talent " + id +
        " is not part of weapon group " + weaponGroup
      );
    }

    bytes[index >> 3] |= 1 << (index & 7);
  }

  const rawPayload = "r" + bytesToBase64Url(bytes);

  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  const compressedPayload =
    "z" + LZString.compressToEncodedURIComponent(binary);

  return compressedPayload.length < rawPayload.length
    ? compressedPayload
    : rawPayload;
}

function decodeBuild(weaponGroup, payload) {
  const ids = getCanonicalBuildIds(weaponGroup);

  if (!payload || !["r", "z"].includes(payload[0])) {
    throw new Error("Invalid build link.");
  }

  let bytes;

  if (payload[0] === "r") {
    bytes = base64UrlToBytes(payload.slice(1));
  } else {
    const binary =
      LZString.decompressFromEncodedURIComponent(payload.slice(1));

    if (binary === null) {
      throw new Error("Unable to decompress build.");
    }

    bytes = Uint8Array.from(
      binary,
      character => character.charCodeAt(0)
    );
  }

  const expectedLength = Math.ceil(ids.length / 8);

  if (bytes.length !== expectedLength) {
    throw new Error("Build does not match this talent tree.");
  }

  return ids
    .filter((id, index) =>
      (bytes[index >> 3] & (1 << (index & 7))) !== 0
    )
    .map(String);
}


// ==============================
// EXPORT BUILD
// ==============================

document.getElementById("exportBuild")
  ?.addEventListener("click", exportBuild);

function exportBuild() {
  if (!currentWeaponGroup) return;

  try {
    const unlockedIds = Object.values(nodes)
      .filter(node => node.currentRank > 0)
      .map(node => Number(node.id));

    const payload = encodeBuild(
      currentWeaponGroup,
      unlockedIds
    );

    const params = new URLSearchParams();
    params.set("w", String(currentWeaponGroup));
    params.set("b", payload);

    const url =
      location.origin +
      location.pathname +
      "?" +
      params.toString();

    navigator.clipboard.writeText(url)
      .then(() => showToast("Build URL copied!"))
      .catch(() => showToast("Unable to copy build URL."));
  } catch (error) {
    console.error("Build export failed:", error);
    showToast("Unable to export build.");
  }
}


// ==============================
// IMPORT BUILD
// ==============================

function loadBuildFromURL() {
  const params = new URLSearchParams(window.location.search);

  const wg = Number.parseInt(params.get("w"), 10);
  const payload = params.get("b");

  if (!Number.isInteger(wg) || wg <= 0) return;

  let importedIds = null;

  if (payload) {
    try {
      importedIds = decodeBuild(wg, payload);
    } catch (error) {
      console.error("Build import failed:", error);
      showToast("Invalid or incompatible build link.");
      return;
    }
  }

  pendingImportedBuild = importedIds;

  setTimeout(() => loadWeaponGroup(wg), 0);
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
