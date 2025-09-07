let treeData; // global VOtree.json data

// Load tree
fetch("VOtree.json")
  .then(res => res.json())
  .then(data => {
    treeData = data;
    buildTree(data);      // draw tree from VOtree.json
    initBranchJump();     // enable branch buttons after build
  });

// === Convert gx/gy to pixel coordinates (with support for grid-based origins) ===
function gridToPx(origin, gx, gy) {
  const cellX = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--cell-x"));
  const cellY = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--cell-y"));

  // Allow origin in pixels (x/y) or in grid units (gx/gy), or a mix
  const originX = (origin.gx ?? 0) * cellX + (origin.x ?? 0);
  const originY = (origin.gy ?? 0) * cellY + (origin.y ?? 0);

  const x = originX + gx * cellX;
  const y = originY + gy * cellY;

  return { x, y };
}

// Backwards-compat alias so all old calls still work
function gridToPixel(branch, node) {
  return gridToPx(branch.origin, node.gx ?? 0, node.gy ?? 0);
}


// === Build Tree ===
function buildTree(data) {
  let maxY = 0;
  const svg = document.getElementById("svg");
  svg.innerHTML = ""; // clear before drawing

  data.tiers.forEach(branch => {
    branch.nodes.forEach(node => {
      const pos = gridToPx(branch.origin, node.gx ?? 0, node.gy ?? 0);
      if (pos.y > maxY) maxY = pos.y;
      const { x: cx, y: cy } = gridToPixel(branch, node);

      // Draw edges to children
      if (node.children) {
        node.children.forEach(childId => {
          const child = branch.nodes.find(n => n.id === childId);
          if (child) {
            const p1 = gridToPixel(branch, node);
            const p2 = gridToPixel(branch, child);
            const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
            line.setAttribute("x1", p1.x);
            line.setAttribute("y1", p1.y);
            line.setAttribute("x2", p2.x);
            line.setAttribute("y2", p2.y);
            line.setAttribute("class", "edge");
            svg.appendChild(line);
          } else {
            console.warn(`Child ${childId} not found for node ${node.id}`);
          }
        });
      }

      // Draw node
      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.setAttribute("class", "node");
      g.setAttribute("data-id", node.id);

      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("class", "node-circle");
      circle.setAttribute("cx", cx);
      circle.setAttribute("cy", cy);
      
      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text.setAttribute("x", cx);
      text.setAttribute("y", cy + 4);
      text.setAttribute("text-anchor", "middle");
      text.textContent = node.label;

      g.appendChild(circle);
      g.appendChild(text);
      svg.appendChild(g);
    });
  });
}

function initBranchJump() {
  document.querySelectorAll(".branch-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      if (!treeData) return;

      const branchId = btn.getAttribute("data-jump");
      const branch = treeData.tiers.find(t => t.id === branchId);
      if (!branch) return;

      const canvas = document.querySelector(".canvas");

      // Resolve the branch's origin into pixel coordinates
      const originPx = gridToPx(branch.origin, 0, 0);

      console.log(`Jumping to branch ${branchId} at (${originPx.x}, ${originPx.y})`);

      canvas.scrollTo({
        left: originPx.x - canvas.clientWidth / 2,
        top: originPx.y - 40,  // place top node near top
        behavior: "smooth"
      });
    });
  });
}


//**
//**
//Testing above
//**
//**




	const svg = document.getElementById('svg');
    const toast = document.getElementById('toast');
    const spentEl = document.getElementById('spent');
    const capEl = document.getElementById('cap');
    const usedSealsEl = document.getElementById('usedSeals');
    const sealCapEl = document.getElementById('sealCap');
    const notesEl = document.getElementById('notes');

    const state = {
      unlocked: new Set(),
      spent: 0,
      seals: 0,
      cap: 70,
      sealCap: 60,
      currentBranch: null, // 'verdant' | 'smite' | 'lifebloom'
      data: null,
      byId: {},
      tierOf: {},
      nodes: new Map(), // id -> {el, circle, label}
      edges: new Map(), // key -> path
      branchRoot: null
    };

    capEl.addEventListener('input', ()=>{ state.cap = +capEl.value || state.cap; updateHUD(); });
    sealCapEl.addEventListener('input', ()=>{ state.sealCap = +sealCapEl.value || state.sealCap; updateHUD(); });

    function toastMsg(m){ toast.textContent=m; toast.classList.add('show'); clearTimeout(toast._t); toast._t=setTimeout(()=>toast.classList.remove('show'), 1400); }

    
    async function init(){
      const res = await fetch('VOtree.json'); const data = await res.json();
      state.data = data;
      // index by id and tier
      for(const tier of data.tiers){
        for(const n of tier.nodes){
          state.byId[n.id] = n;
          state.tierOf[n.id] = tier.id;
        }
      }
      build();
      updateHUD();
    }

    function build(){
      svg.innerHTML = '';
      // Height estimate: find max Y
      let maxY = 0;
      for(const tier of state.data.tiers){
        for(const n of tier.nodes){
          const p = gridToPx(tier.origin, n.gx, n.gy);
          if(p.y > maxY) maxY = p.y;
        }
      }
      svg.setAttribute('viewBox', `0 0 2000 ${maxY + 400}`);

      // Draw edges first (so they are under nodes)
      for(const tier of state.data.tiers){
        for(const n of tier.nodes){
          const a = gridToPx(tier.origin, n.gx, n.gy);
          for(const ch of (n.children||[])){
            const t = state.byId[ch]; if(!t) continue;
            const tTier = state.data.tiers.find(tt => tt.nodes.includes(t));
            const b = gridToPx(tTier.origin, t.gx, t.gy);
            const key = n.id + '->' + ch;
            const line = document.createElementNS('http://www.w3.org/2000/svg','line');
            line.setAttribute('x1', a.x); line.setAttribute('y1', a.y);
            line.setAttribute('x2', b.x); line.setAttribute('y2', b.y);
            line.setAttribute('class','edge');
            if (tier.id === 'smite' || tier.id === 'lifebloom') {
              line.classList.add('hidden');
            }
            svg.appendChild(line);
            state.edges.set(key, line);
          }
        }
      }

      // Draw nodes
      for(const tier of state.data.tiers){
        for(const n of tier.nodes){
          const p = gridToPx(tier.origin, n.gx, n.gy);
          const g = document.createElementNS('http://www.w3.org/2000/svg','g');
          g.setAttribute('class', 'node locked');
          g.dataset.id = n.id;
          g.setAttribute('transform', `translate(${p.x},${p.y})`);

          const c = document.createElementNS('http://www.w3.org/2000/svg','circle');
          c.setAttribute('r', 20); c.setAttribute('class','node-circle');

          const label = document.createElementNS('http://www.w3.org/2000/svg','text');
          label.setAttribute('text-anchor','middle'); label.setAttribute('dy','.35em');
          label.textContent = n.icon || '●';

          g.appendChild(c); g.appendChild(label);
          svg.appendChild(g);

          // events
          g.addEventListener('click', (e)=>{ e.preventDefault(); tryUnlock(n.id); });
          g.addEventListener('contextmenu', (e)=>{ e.preventDefault(); refundBranch(n.id); });
          g.addEventListener('mouseenter', ()=> showNotes(n));
          g.addEventListener('mouseleave', ()=> {/* keep notes shown */});

          state.nodes.set(n.id, {el:g, circle:c, label});
        }
      }

      // exclusivity: hide smite/lifebloom trees until roots selected
      updateVisibility();
      updateStyles();
    }

    function showNotes(n){
      notesEl.innerHTML = `<strong>${n.name}</strong><br>${n.desc||''}<br><br>Cost: ${n.cost||1} pts`;
    }

    function prereqsMet(id){
      const n = state.byId[id];
      // must have parents unlocked (implicit via children graph: check any node that links to id)
      const parents = [];
      for(const a in state.byId){
        const node = state.byId[a];
        if((node.children||[]).includes(id)) parents.push(a);
      }
      return parents.length === 0 || parents.some(p => state.unlocked.has(p));
    }

    function tierRequirementsMet(tierId){
      const tier = state.data.tiers.find(t=>t.id===tierId);
      return (tier.requiresUnlocked||[]).every(id => state.unlocked.has(id));
    }

    function tryUnlock(id){
      const n = state.byId[id];
      const tierId = state.tierOf[id];
      if(!tierRequirementsMet(tierId)) return;

      // exclusivity: selecting smi01 hides Life Bloom, and vice versa
      if(id==='smi01'){
        // hide lifebloom branch, refund it if any
        refundTier('lifebloom');
      }
      if(id==='lb01'){
        refundTier('smite');
      }

      if(state.unlocked.has(id)) return;
      if(!prereqsMet(id)) return;
      const cost = n.cost||1;
      if(state.spent + cost > state.cap) return;

      state.unlocked.add(id);
      state.spent += cost;
      updateHUD();
      updateStyles();
      updateVisibility();
    }

    function refundTier(tierId){
      // remove all unlocked nodes in that tier
      const tier = state.data.tiers.find(t=>t.id===tierId);
      if(!tier) return;
      const ids = tier.nodes.map(n=>n.id);
      let refunded=false;
      for(const id of ids){
        if(state.unlocked.has(id)){
          state.unlocked.delete(id);
          state.spent -= (state.byId[id].cost||1);
          refunded=true;
        }
      }
      if(refunded){ updateHUD(); updateStyles(); updateVisibility(); }
    }

    function refundBranch(id){
      // refund node and descendants
      if(!state.unlocked.has(id)) return;
      const toRefund = new Set();
      (function dfs(cur){
        toRefund.add(cur);
        for(const nid in state.byId){
          const node = state.byId[nid];
          if((node.children||[]).includes(cur) && state.unlocked.has(nid)){
            // parent refund not needed for descendants; we refund downward only
          }
        }
        const ch = state.byId[cur].children||[];
        for(const c of ch){
          if(state.unlocked.has(c)) dfs(c);
        }
      })(id);
      for(const rid of toRefund){
        if(state.unlocked.delete(rid)){
          state.spent -= (state.byId[rid].cost||1);
        }
      }
      updateHUD(); updateStyles(); updateVisibility();
    }

    function updateHUD(){
      spentEl.textContent = state.spent;
      usedSealsEl.textContent = state.seals;
      document.getElementById('resetCurrent').disabled = !anyUnlocked();
    }

    function anyUnlocked(){
      return state.unlocked.size > 0;
    }

    function updateStyles(){
      // nodes
      for(const [id, ref] of state.nodes){
        ref.el.classList.remove('locked','available','unlocked');
        const tierId = state.tierOf[id];
        const reqMet = tierRequirementsMet(tierId);
        if(state.unlocked.has(id)) ref.el.classList.add('unlocked');
        else if(reqMet && prereqsMet(id) && state.spent + (state.byId[id].cost||1) <= state.cap) ref.el.classList.add('available');
        else ref.el.classList.add('locked');
      }
      // edges active style
      for(const [key, line] of state.edges){
        const [a,b] = key.split('->');
        const active = state.unlocked.has(a) && state.unlocked.has(b);
        line.setAttribute('class', 'edge' + (active? ' active':''));
      }
    }

    function updateVisibility(){
      // Smite/Life Bloom visibility:
      const voComplete = [...Array(30)].every((_,i)=> state.unlocked.has(`vo${String(i+1).padStart(2,'0')}`));
      const smiteRoot = state.nodes.get('smi01');
      const lbRoot = state.nodes.get('lb01');

      // Roots are always visible (but locked until vo complete)
      if(smiteRoot) smiteRoot.el.style.display = '';
      if(lbRoot) lbRoot.el.style.display = '';

      const showSmite = state.unlocked.has('smi01');
      const showLB = state.unlocked.has('lb01');

      // Toggle visibility for smite/lifebloom nodes/edges based on root unlock
      for(const [id, ref] of state.nodes){
        const tierId = state.tierOf[id];
        if(tierId==='smite'){
          ref.el.style.display = (id==='smi01' || showSmite) ? '' : 'none';
        }else if(tierId==='lifebloom'){
          ref.el.style.display = (id==='lb01' || showLB) ? '' : 'none';
        }
      }

      for(const [key, line] of state.edges){
        const [a,b]=key.split('->');
        const tierA = state.tierOf[a];
        if(tierA==='smite'){
          line.style.display = showSmite ? '' : 'none';
        }else if(tierA==='lifebloom'){
          line.style.display = showLB ? '' : 'none';
        }else{
          line.style.display = '';
        }
      }
    }

    // Sidebar behaviors
    document.getElementById('collapseBtn').addEventListener('click', ()=>{
      document.getElementById('sidebar').classList.toggle('collapsed');
    });

    document.querySelectorAll('.branch-btn').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const target = btn.dataset.jump;
        // simple scroll: find first node in tier and scroll there
        const tier = state.data.tiers.find(t=>t.id===target);
        if(!tier) return;
        const ids = tier.nodes.map(n=>n.id);
        const first = state.nodes.get(ids[0]);
        if(first){
          const bb = first.el.getBoundingClientRect();
          window.scrollTo({ top: window.scrollY + bb.top - 120, behavior: 'smooth' });
        }
      });
    });

    // Max buttons
    document.getElementById('maxVerdant').addEventListener('click', ()=>{
      const ids = state.data.tiers.find(t=>t.id==='verdant').nodes.map(n=>n.id);
      for(const id of ids){
        if(!state.unlocked.has(id) && prereqsMet(id)){
          const cost = state.byId[id].cost||1;
          if(state.spent + cost <= state.cap){ state.unlocked.add(id); state.spent += cost; }
        }
      }
      updateHUD(); updateStyles(); updateVisibility();
    });
    document.getElementById('maxSmite').addEventListener('click', ()=>{
      // require vo complete
      const voComplete = [...Array(30)].every((_,i)=> state.unlocked.has(`vo${String(i+1).padStart(2,'0')}`));
      if(!voComplete){ toastMsg('Complete Verdant Oracle first.'); return; }
      refundTier('lifebloom');
      const ids = state.data.tiers.find(t=>t.id==='smite').nodes.map(n=>n.id);
      for(const id of ids){
        if(!state.unlocked.has(id) && (id==='smi01' || prereqsMet(id))){
          const cost = state.byId[id].cost||1;
          if(state.spent + cost <= state.cap){ state.unlocked.add(id); state.spent += cost; }
        }
      }
      updateHUD(); updateStyles(); updateVisibility();
    });
    document.getElementById('maxLifeBloom').addEventListener('click', ()=>{
      const voComplete = [...Array(30)].every((_,i)=> state.unlocked.has(`vo${String(i+1).padStart(2,'0')}`));
      if(!voComplete){ toastMsg('Complete Verdant Oracle first.'); return; }
      refundTier('smite');
      const ids = state.data.tiers.find(t=>t.id==='lifebloom').nodes.map(n=>n.id);
      for(const id of ids){
        if(!state.unlocked.has(id) && (id==='lb01' || prereqsMet(id))){
          const cost = state.byId[id].cost||1;
          if(state.spent + cost <= state.cap){ state.unlocked.add(id); state.spent += cost; }
        }
      }
      updateHUD(); updateStyles(); updateVisibility();
    });

    // Reset buttons
    document.getElementById('resetAll').addEventListener('click', ()=>{
      state.unlocked.clear(); state.spent=0; updateHUD(); updateStyles(); updateVisibility(); toastMsg('All talents refunded.');
    });
    document.getElementById('resetCurrent').addEventListener('click', ()=>{
      // Priority: Smite/Life Bloom → Verdant
      const hasSmite = state.data.tiers.find(t=>t.id==='smite').nodes.some(n=>state.unlocked.has(n.id));
      const hasLB = state.data.tiers.find(t=>t.id==='lifebloom').nodes.some(n=>state.unlocked.has(n.id));
      if(hasSmite){ refundTier('smite'); toastMsg('Smite talents refunded.'); return; }
      if(hasLB){ refundTier('lifebloom'); toastMsg('Life Bloom talents refunded.'); return; }
      refundTier('verdant'); toastMsg('Verdant talents refunded.');
    });

    document.getElementById('clearNotes').addEventListener('click', ()=>{
      notesEl.innerHTML = 'Hover / select a skill for more details.<br><br>⭮ Reset Current Branch: Resets only the branch where you’ve invested points.<br>Priority: Smite / Life Bloom → Verdant Oracle.';
    });

    init();

  console.log('script placeholder');

  const legendBox = document.getElementById("legend");
  const expandedLegend = legendBox.querySelector(".legend-expanded");
  const collapsedLegend = legendBox.querySelector(".legend-collapsed");

  function toggleLegend() {
    const isCollapsed = legendBox.classList.toggle("collapsed");
    expandedLegend.style.display = isCollapsed ? "none" : "block";
    collapsedLegend.style.display = isCollapsed ? "flex" : "none";
  }

  // Click anywhere on legend toggles expand/collapse
  legendBox.addEventListener("click", toggleLegend);


// scroll zoomies
(function() {
  const svg = document.getElementById("svg");
  let viewBox = { x: 0, y: 0, w: 2000, h: 2000 };
  let isPanning = false;
  let start = { x: 0, y: 0 };

  function updateViewBox() {
    svg.setAttribute("viewBox", `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`);
  }

  // Zoom with mouse wheel
  svg.addEventListener("wheel", e => {
    e.preventDefault();
    const zoomFactor = 1.1;
    const { offsetX, offsetY } = e;

    // Mouse position in SVG coords
    const svgPointX = viewBox.x + (offsetX / svg.clientWidth) * viewBox.w;
    const svgPointY = viewBox.y + (offsetY / svg.clientHeight) * viewBox.h;

    if (e.deltaY < 0) { // zoom in
      viewBox.w /= zoomFactor;
      viewBox.h /= zoomFactor;
    } else { // zoom out
      viewBox.w *= zoomFactor;
      viewBox.h *= zoomFactor;
    }

    // Keep zoom centered on mouse
    viewBox.x = svgPointX - (offsetX / svg.clientWidth) * viewBox.w;
    viewBox.y = svgPointY - (offsetY / svg.clientHeight) * viewBox.h;

    updateViewBox();
  });

  // Pan with mouse drag
  svg.addEventListener("mousedown", e => {
    isPanning = true;
    start.x = e.clientX;
    start.y = e.clientY;
  });

  window.addEventListener("mousemove", e => {
    if (!isPanning) return;
    const dx = (e.clientX - start.x) * (viewBox.w / svg.clientWidth);
    const dy = (e.clientY - start.y) * (viewBox.h / svg.clientHeight);
    viewBox.x -= dx;
    viewBox.y -= dy;
    start.x = e.clientX;
    start.y = e.clientY;
    updateViewBox();
  });

  window.addEventListener("mouseup", () => isPanning = false);

  // Initialize
  updateViewBox();
})();
