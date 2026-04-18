/* ══════════════════════════════════════════════════════════════
   CUSTOMER APP LOGIC
   ══════════════════════════════════════════════════════════════ */

let RESTAURANT = null;
let MENU = [];
let CATEGORIES = [];
let BUTTONS = [];
let QUIZ = [];

const escapeHTML = API.escape;

// Parse URL: /r/slug
const pathParts = window.location.pathname.split('/');
const SLUG = pathParts[pathParts.length - 1]; // get 'slug' from /r/slug

async function init() {
  if (!SLUG) { showToast('Invalid restaurant link', true); return; }
  
  try {
    // 1. Fetch restaurant public data
    const res = await fetch(`/api/public/restaurant/${SLUG}`);
    if (!res.ok) throw new Error('Restaurant not found');
    RESTAURANT = await res.json();
    
    // 2. Fetch active menu, buttons
    const [menuRes, btnRes] = await Promise.all([
      fetch(`/api/public/restaurant/${SLUG}/menu`),
      fetch(`/api/public/restaurant/${SLUG}/buttons`)
    ]);
    
    const menuData = await menuRes.json();
    MENU = menuData.items || menuData; // Handle legacy array format just in case
    CATEGORIES = menuData.categories || [];
    BUTTONS = await btnRes.json();
    
    setupUI();
  } catch (e) {
    document.body.innerHTML = `<div style="text-align:center;padding:50px;font-family:sans-serif"><h1>Oops!</h1><p>${escapeHTML(e.message)}</p></div>`;
  }
}

function setupUI() {
  document.title = `${RESTAURANT.name} | Menu & Ordering`;
  
  // Apply Branding Colors
  const root = document.documentElement;
  if(RESTAURANT.primary_color) root.style.setProperty('--primary', RESTAURANT.primary_color);
  if(RESTAURANT.accent_color) root.style.setProperty('--accent', RESTAURANT.accent_color);
  if(RESTAURANT.accent2_color) root.style.setProperty('--accent2', RESTAURANT.accent2_color);
  if(RESTAURANT.bg_color) root.style.setProperty('--bg', RESTAURANT.bg_color);

  // Header Details
  document.getElementById('h-name').textContent = RESTAURANT.name;
  document.getElementById('h-kicker').textContent = RESTAURANT.kicker || '';
  document.getElementById('h-tag').textContent = RESTAURANT.tagline || '';
  
  if (RESTAURANT.logo_image) {
    document.getElementById('h-logo').innerHTML = `<img src="${escapeHTML(RESTAURANT.logo_image)}"/>`;
  } else {
    document.getElementById('h-logo').textContent = RESTAURANT.logo_emoji || '🍽️';
  }

  // Pre-render Menu
  renderMenu();
}

// ─── Navigation ────────────────────────────────────────────────
function navigate(view) {
  document.querySelectorAll('main.container').forEach(el => el.classList.remove('active'));
  document.getElementById('header').style.display = view === 'home' || view === 'status' ? 'block' : 'none';
  document.getElementById('btn-back').style.display = view === 'home' || view === 'status' ? 'none' : 'block';
  document.getElementById('view-' + view).classList.add('active');
  window.scrollTo(0,0);
  
  if(view === 'quiz') startQuiz();
  if(view === 'surprise') renderPicker();
}

// ─── Menu ──────────────────────────────────────────────────────
function renderMenu() {
  // Use explicitly sorted categories if available, else fallback to scraping
  let cats = CATEGORIES.length ? CATEGORIES : [...new Set(MENU.map(i => i.category))];
  
  // Filter out empty categories so the customer doesn't see blank screens
  cats = cats.filter(c => MENU.some(i => i.category === c));

  if (!cats.length) {
    document.getElementById('menu-cat-filters').innerHTML = '';
    document.getElementById('menu-list').innerHTML = `<div style="text-align:center;padding:40px;color:var(--dim)">Menu is empty</div>`;
    return;
  }

  document.getElementById('menu-cat-filters').innerHTML = cats.map((c, idx) => `<button class="filter-pill ${idx===0?'active':''}" onclick="filterCat(${idx}, this)">${escapeHTML(c)}</button>`).join('');
  
  const list = document.getElementById('menu-list');
  list.innerHTML = ''; // Ensure list is cleared before rendering
  
  cats.forEach((c, idx) => {
    const items = MENU.filter(i => i.category === c);
    const html = `
      <div class="menu-group" id="cat-group-${idx}" style="${idx===0 ? '' : 'display:none'}">
        <h2 class="cat-title">${escapeHTML(c)}</h2>
        ${items.map(i => `
          <div class="dish-card">
            <div class="dish-img">${i.img.length < 5 ? i.img : `<img src="${escapeHTML(i.img)}"/>`}</div>
            <div class="dish-body">
              <div class="dish-header"><div class="dish-name">${escapeHTML(i.name)}</div><div class="dish-price">${RESTAURANT.currency}${i.price.toFixed(2)}</div></div>
              ${i.description ? `<div class="dish-desc">${escapeHTML(i.description)}</div>` : ''}
              <div class="dish-meta">
                ${i.diet !== 'meat' ? `<span class="badge badge-dim">${escapeHTML(i.diet)}</span>` : ''}
                ${!i.available ? `<span class="badge badge-error">Sold Out</span>` : ''}
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
    list.insertAdjacentHTML('beforeend', html);
  });
}

function filterCat(idx, btn) {
  document.querySelectorAll('#menu-cat-filters .filter-pill').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.menu-group').forEach(el => el.style.display = 'none');
  const target = document.getElementById('cat-group-' + idx);
  if (target) target.style.display = 'block';
}



// ─── Surprise Me (Picker) ──────────────────────────────────────
function renderPicker() {
  const cats = CATEGORIES.length ? CATEGORIES : [...new Set(MENU.map(i => i.category))];
  const list = document.getElementById('picker-grid');
  list.innerHTML = cats.map(c => {
    // try find an item emoji
    const item = MENU.find(i => i.category === c && i.img.length < 5);
    const emoji = item ? item.img : '🍽️';
    return `<div class="picker-card" onclick="surpriseMatch('${escapeHTML(c)}')"><div class="picker-emoji">${emoji.length < 5 ? emoji : '✨'}</div><div class="picker-label">${escapeHTML(c)}</div></div>`;
  }).join('');
}

window.surpriseMatch = (cat) => {
  let pool = MENU.filter(i => i.available);
  if (cat !== 'all') pool = pool.filter(i => i.category === cat);
  if (!pool.length) { showToast('Nothing available in this category', true); return; }
  
  const winner = pool[Math.floor(Math.random() * pool.length)];
  const res = document.getElementById('match-result');
  
  res.innerHTML = `
    <div class="match-card">
      <div style="font-size:4rem; margin-bottom:12px;">${winner.img.length < 5 ? winner.img : '✨'}</div>
      <h3 style="font-family:var(--font-display); font-size:1.8rem; margin-bottom:8px">${escapeHTML(winner.name)}</h3>
      <div style="color:var(--primary); font-weight:600; font-size:1.2rem; margin-bottom:24px">${RESTAURANT.currency}${winner.price.toFixed(2)}</div>
      <button class="btn btn-primary" style="width:100%" onclick="navigate('browse')">View on Menu</button>
    </div>
  `;
  navigate('match');
  party.confetti(res, { count: 30, spread: 40 });
};

// ─── Matchmaker Quiz ─────────────────────────────────────────────
let currentQNode = null; // null means category selection
let userTags = [];
let targetCategories = [];
let answersObj = {};
let QUIZ_TREE = {};

function startQuiz() {
  QUIZ_TREE = {
    q_start: {
      question: "What are you looking for today?",
      answers: [
        { text: "Just a light snack", tags: ["snack", "light"], next: "q_snack", values: {meal_type: "snack", hunger: "light"} },
        { text: "A normal meal", tags: ["main"], next: "q_meal", values: {meal_type: "main", hunger: "moderate"} },
        { text: "I'm starving! (Comfort)", tags: ["main", "heavy", "comfort"], next: "q_comfort", values: {meal_type: "main", hunger: "very hungry"} },
        { text: "Sweet tooth / Drinks", tags: ["dessert", "sweet", "drink"], next: "q_sweet", values: {meal_type: "snack", hunger: "light", spice: "sweet"} }
      ]
    },
    
    // SNACK PATH
    q_snack: {
      question: "How do you like your snacks?",
      answers: [
        { text: "Fried & Crispy", tags: ["fried", "crispy", "crunchy"], next: "q_diet", values: {texture: "crispy"} },
        { text: "Baked & Healthy", tags: ["baked", "healthy"], next: "q_diet", values: {texture: "soft"} },
        { text: "Cold & Fresh", tags: ["cold", "fresh"], next: "q_diet", values: {texture: "anything"} }
      ]
    },
    
    // MEAL PATH
    q_meal: {
      question: "What's the vibe of the meal?",
      answers: [
        { text: "Light & fresh (Salads/Wraps)", tags: ["light", "fresh", "healthy"], next: "q_diet", values: {texture: "anything"} },
        { text: "Hearty & filling (Burgers/Rice)", tags: ["hearty", "filling"], next: "q_protein", values: {} },
        { text: "Spiced & flavorful (Curries/Pasta)", tags: ["spiced", "flavor", "rich"], next: "q_spice", values: {} }
      ]
    },

    // COMFORT PATH
    q_comfort: {
      question: "What kind of comfort food?",
      answers: [
        { text: "Cheesy goodness", tags: ["cheese", "dairy", "creamy"], next: "q_diet", values: {texture: "creamy"} },
        { text: "Carb loading (Pizza/Breads)", tags: ["carbs", "bread", "dough", "pizza", "pasta"], next: "q_diet", values: {} },
        { text: "Meat lover's paradise", tags: ["meat", "heavy", "protein", "beef", "chicken"], next: "q_spice", values: {diet: "non-veg"} }
      ]
    },

    // SWEET/DRINK PATH
    q_sweet: {
      question: "Satisfying a sweet tooth or just thirsty?",
      answers: [
        { text: "Definitely Dessert", tags: ["dessert", "sweet", "cake", "icecream"], next: "q_dessert_type", values: {spice: "sweet"} },
        { text: "A refreshing beverage", tags: ["drink", "beverage", "liquid", "cold"], next: "q_drink_type", values: {} }
      ]
    },

    // DESSERT TYPE
    q_dessert_type: {
      question: "What kind of dessert?",
      answers: [
        { text: "Chocolate lover", tags: ["chocolate", "rich", "brownie"], next: "end", values: {} },
        { text: "Fruity & light", tags: ["fruit", "berry", "light"], next: "end", values: {} },
        { text: "Pastries & Baked", tags: ["pastry", "baked", "cake", "pie"], next: "end", values: {} }
      ]
    },

    // DRINK TYPE
    q_drink_type: {
      question: "Hot or Cold beverage?",
      answers: [
        { text: "Ice cold & refreshing", tags: ["cold", "ice", "soda", "juice"], next: "end", values: {} },
        { text: "Warm & cozy", tags: ["hot", "coffee", "tea", "warm"], next: "end", values: {} }
      ]
    },

    // FOLLOW-UP: PROTEIN
    q_protein: {
      question: "Any preference on the protein?",
      answers: [
        { text: "Chicken / Poultry", tags: ["chicken", "poultry", "bird"], next: "q_spice", values: {diet: "non-veg"} },
        { text: "Beef / Steak", tags: ["beef", "steak", "red meat"], next: "q_spice", values: {diet: "non-veg"} },
        { text: "Seafood", tags: ["seafood", "fish", "prawn"], next: "q_spice", values: {diet: "non-veg"} },
        { text: "Keep it plant-based", tags: ["veg", "plant", "vegan"], next: "q_spice", values: {diet: "veg"} }
      ]
    },

    // FOLLOW-UP: SPICE
    q_spice: {
      question: "How much heat can you handle?",
      answers: [
        { text: "Mild / No Spice", tags: ["mild", "plain"], next: "q_diet", values: {spice: "low"} },
        { text: "A little kick", tags: ["medium", "kick"], next: "q_diet", values: {spice: "medium"} },
        { text: "Bring the heat! 🌶️", tags: ["spicy", "hot", "chili"], next: "q_diet", values: {spice: "spicy"} }
      ]
    },

    // FINAL CONVERGENCE (for food)
    q_diet: {
      question: "Any strict dietary restrictions?",
      answers: [
        { text: "Vegetarian", tags: ["veg", "vegetarian"], next: "end", values: {diet: "veg"} },
        { text: "Vegan", tags: ["vegan", "plant-based"], next: "end", values: {diet: "vegan"} },
        { text: "Nope, anything goes!", tags: [], next: "end", values: {} }
      ]
    }
  };

  answersObj = {
    hunger: 'moderate',
    spice: 'medium',
    diet: 'none',
    texture: 'anything',
    meal_type: 'main'
  };
  
  currentQNode = "q_start";
  userTags = [];
  renderQuiz();
}

function renderQuiz() {
  const qTitle = document.getElementById('q-text');
  const qOpts = document.getElementById('q-opts');

  if (currentQNode === "end") {
    endQuiz();
    return;
  }
  
  const q = QUIZ_TREE[currentQNode];
  qTitle.textContent = q.question;
  qOpts.innerHTML = q.answers.map((a, idx) => `
    <div class="qz-btn" onclick="answerQ(${idx})">${escapeHTML(a.text)}</div>
  `).join('');
}

window.answerQ = (idx) => {
  const q = QUIZ_TREE[currentQNode];
  const ans = q.answers[idx];
  
  if (ans.tags) {
    userTags = [...userTags, ...ans.tags];
  }
  
  if (ans.values) {
    answersObj = { ...answersObj, ...ans.values };
  }
  
  currentQNode = ans.next;
  renderQuiz();
};

function endQuiz() {
  let comboMatches = [];

  let pool = MENU.filter(i => i.available);
  if (!pool.length) { showToast('Could not find matches!', true); navigate('home'); return; }
      
    pool.forEach(item => {
      let score = 0;
      let itags = [];
      try { itags = (typeof item.tags === 'string' ? JSON.parse(item.tags) : item.tags) || []; } catch(e) {}
      itags = itags.map(t=>t.toLowerCase());
      
      const hasTag = (tag) => itags.includes(tag) || itags.some(t => t.includes(tag) || tag.includes(t));
      
      const itemMealType = hasTag('snack') || hasTag('starter') || hasTag('appetizer') ? 'snack' : 'main';
      
      if (answersObj.hunger === 'very hungry' && itemMealType === 'main') score += 2;
      else if (answersObj.hunger === 'light' && itemMealType === 'snack') score += 2;
      else if (answersObj.hunger === 'moderate') score += 1;
      
      if (answersObj.meal_type === itemMealType) score += 2;
      
      const itemSpice = hasTag('spicy') || hasTag('hot') ? 'spicy' : (hasTag('sweet') || hasTag('dessert') ? 'sweet' : (hasTag('mild') ? 'low' : 'medium'));
      if (answersObj.spice === itemSpice) score += 2;
      
      const itemDietMode = (item.diet && item.diet.toLowerCase() === 'veg' || hasTag('veg') || hasTag('vegetarian')) ? 'veg' : 
                          (item.diet && item.diet.toLowerCase() === 'vegan' || hasTag('vegan')) ? 'vegan' : 'non-veg';
                           
      if (answersObj.diet !== 'none') {
        if (answersObj.diet === itemDietMode) score += 3;
        else score -= 5;
      }
      
      if (answersObj.texture !== 'anything' && hasTag(answersObj.texture)) score += 2;
      
      userTags.forEach(ut => {
        if(hasTag(ut)) score += 2;
      });
      
      item._score = score;
    });
    
    pool.sort((a,b) => b._score - a._score);
    
    const maxScore = pool[0]._score;
    const tops = pool.filter(i => i._score === maxScore);
    const winner = tops[Math.floor(Math.random() * tops.length)];
    comboMatches.push(winner);

  if (!comboMatches.length) { showToast('Could not find matches!', true); navigate('home'); return; }

  const res = document.getElementById('match-result');
  res.innerHTML = `
    <div style="color:var(--dim); font-size:.9rem; margin-bottom:12px; text-transform:uppercase; letter-spacing:1px; text-align:center;">Your Curated Meal</div>
    <div style="display:flex; flex-direction:column; gap:16px; margin-bottom: 24px;">
      ${comboMatches.map(winner => `
        <div class="match-card" style="padding: 16px; text-align:left; display:flex; gap:16px; align-items:center; margin-top:0;">
          <div style="font-size:3rem; flex-shrink:0;">${winner.img.length < 5 ? winner.img : '✨'}</div>
          <div>
            <div style="font-size:.8rem; color:var(--primary); font-weight:bold; letter-spacing:1px; text-transform:uppercase; margin-bottom:4px;">${escapeHTML(winner.category)}</div>
            <h3 style="font-family:var(--font-display); font-size:1.4rem; margin-bottom:4px">${escapeHTML(winner.name)}</h3>
            <div style="color:var(--dim); font-weight:600; font-size:1.1rem;">${RESTAURANT.currency}${winner.price.toFixed(2)}</div>
          </div>
        </div>
      `).join('')}
    </div>
    <button class="btn btn-primary" style="width:100%" onclick="navigate('browse')">View Full Menu</button>
  `;
  navigate('match');
  party.confetti(res, { count: 60, spread: 70 });
}

// Toast
let tt;
function showToast(msg, isErr) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.className = 'toast show' + (isErr ? ' error' : '');
  clearTimeout(tt); tt = setTimeout(() => el.className = 'toast', 2500);
}

// Ignite
init();
