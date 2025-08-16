/* ========= LocalStorage Helpers ========= */
const LS_KEY = "hourtrackr.shifts";
const LS_THEME = "hourtrackr.theme";
const getShifts = () => JSON.parse(localStorage.getItem(LS_KEY) || "[]");
const setShifts = (arr) => localStorage.setItem(LS_KEY, JSON.stringify(arr));

/* ========= DOM Elements ========= */
const form = document.getElementById("shiftForm");
const msg = document.getElementById("msg");
const tbody = document.getElementById("tbody");
const totalHoursEl = document.getElementById("totalHours");
const totalRegHrsEl = document.getElementById("totalRegHrs");
const totalOtHrsEl = document.getElementById("totalOtHrs");
const totalEarningsEl = document.getElementById("totalEarnings");
const themeToggle = document.getElementById("themeToggle");
const clearAllBtn = document.getElementById("clearAll");

/* ========= Chart Setup ========= */
let chart;
function ensureChart() {
  const ctx = document.getElementById("earningsChart").getContext("2d");
  if (chart) return chart;
  chart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["Regular $", "Overtime $"],
      datasets: [{
        data: [0, 0],
        // No explicit colors (lets Chart.js default or theme css variables influence)
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: "bottom" },
        tooltip: {
          callbacks: {
            label: (context) => {
              const val = context.parsed;
              return `${context.label}: ${formatCurrency(val)}`;
            }
          }
        }
      },
      cutout: "62%"
    }
  });
  return chart;
}

/* ========= Utilities ========= */
function showMessage(text, type = "info") {
  msg.textContent = text;
  msg.className = `msg ${type}`;
  if (!text) return;
  setTimeout(() => { msg.textContent = ""; msg.className = "msg"; }, 2500);
}
function minutesBetween(dateStr, tIn, tOut) {
  // Build Date objects using the same date
  const [ih, im] = tIn.split(":").map(Number);
  const [oh, om] = tOut.split(":").map(Number);
  const base = new Date(`${dateStr}T00:00:00`);
  const inDate = new Date(base); inDate.setHours(ih, im, 0, 0);
  const outDate = new Date(base); outDate.setHours(oh, om, 0, 0);

  let diff = (outDate - inDate) / (1000 * 60); // minutes
  // Overnight shift: if out < in, add 24h
  if (diff < 0) diff += 24 * 60;
  return diff;
}
function formatCurrency(n) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);
}
function toHours(mins) { return (mins / 60); }
function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

/* ========= Renderers ========= */
function render() {
  const shifts = getShifts();
  tbody.innerHTML = "";

  let sumRegMin = 0, sumOtMin = 0, sumReg$ = 0, sumOt$ = 0;

  for (const s of shifts) {
    sumRegMin += s.regMinutes;
    sumOtMin  += s.otMinutes;
    sumReg$   += s.regEarnings;
    sumOt$    += s.otEarnings;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${s.date}</td>
      <td>${s.clockIn}</td>
      <td>${s.clockOut}</td>
      <td>${s.breakMin} min</td>
      <td>${formatCurrency(s.rate)}</td>
      <td>${toHours(s.regMinutes).toFixed(2)}</td>
      <td>${toHours(s.otMinutes).toFixed(2)}</td>
      <td>${formatCurrency(s.regEarnings)}</td>
      <td>${formatCurrency(s.otEarnings)}</td>
      <td>${formatCurrency(s.totalEarnings)}</td>
      <td class="rowActions">
        <button class="action" data-id="${s.id}" aria-label="Delete row">🗑️</button>
      </td>
    `;
    tbody.appendChild(tr);
  }

  const totalMin = sumRegMin + sumOtMin;
  totalHoursEl.textContent = toHours(totalMin).toFixed(2);
  totalRegHrsEl.textContent = toHours(sumRegMin).toFixed(2);
  totalOtHrsEl.textContent  = toHours(sumOtMin).toFixed(2);
  totalEarningsEl.textContent = formatCurrency(sumReg$ + sumOt$);

  // Update chart
  const c = ensureChart();
  c.data.datasets[0].data = [sumReg$, sumOt$];
  c.update();
}

function addShift({ date, clockIn, clockOut, breakMin, rate, otAfterHrs, otMult }) {
  const rawMinutes = minutesBetween(date, clockIn, clockOut);
  const breakM = clamp(Number(breakMin) || 0, 0, 24 * 60);
  const netMinutes = rawMinutes - breakM;

  if (isNaN(netMinutes) || netMinutes <= 0) {
    showMessage("Time inputs produce zero/negative minutes. Check break or times.", "error");
    return;
  }

  const otThresholdMin = clamp(Number(otAfterHrs) * 60, 0, 24 * 60);
  const rateNum = clamp(Number(rate), 0, 1e9);
  const multiplier = clamp(Number(otMult), 1, 10);

  const regMinutes = Math.min(netMinutes, otThresholdMin);
  const otMinutes  = Math.max(0, netMinutes - otThresholdMin);

  const regEarnings = toHours(regMinutes) * rateNum;
  const otEarnings  = toHours(otMinutes)  * rateNum * multiplier;
  const totalEarnings = regEarnings + otEarnings;

  const shift = {
    id: crypto.randomUUID(),
    date, clockIn, clockOut,
    breakMin: breakM,
    rate: rateNum,
    otAfterHrs: Number(otAfterHrs),
    otMult: multiplier,
    regMinutes, otMinutes, regEarnings, otEarnings, totalEarnings
  };

  const shifts = getShifts();
  shifts.push(shift);
  setShifts(shifts);
  render();
  showMessage("Shift added ✅", "ok");
}

/* ========= Events ========= */
form.addEventListener("submit", (e) => {
  e.preventDefault();
  const date = document.getElementById("date").value;
  const clockIn = document.getElementById("clockIn").value;
  const clockOut = document.getElementById("clockOut").value;
  const breakMin = document.getElementById("breakMin").value;
  const rate = document.getElementById("rate").value;
  const otAfterHrs = document.getElementById("otAfter").value;
  const otMult = document.getElementById("otMult").value;

  if (!date || !clockIn || !clockOut || !rate) {
    showMessage("Please complete all required fields.", "error");
    return;
  }
  addShift({ date, clockIn, clockOut, breakMin, rate, otAfterHrs, otMult });
  form.reset();
});

tbody.addEventListener("click", (e) => {
  const btn = e.target.closest("button.action");
  if (!btn) return;
  const id = btn.getAttribute("data-id");
  const shifts = getShifts().filter(s => s.id !== id);
  setShifts(shifts);
  render();
  showMessage("Shift removed 🗑️", "ok");
});

themeToggle.addEventListener("click", () => {
  const html = document.documentElement;
  const next = html.getAttribute("data-theme") === "dark" ? "light" : "dark";
  html.setAttribute("data-theme", next);
  localStorage.setItem(LS_THEME, next);
});

clearAllBtn.addEventListener("click", () => {
  if (!confirm("Delete all saved shifts? This cannot be undone.")) return;
  localStorage.removeItem(LS_KEY);
  render();
  showMessage("All data cleared.", "ok");
});

/* ========= Init ========= */
(function init() {
  // Default date to today
  document.getElementById("date").valueAsDate = new Date();

  // Theme from LocalStorage
  const storedTheme = localStorage.getItem(LS_THEME);
  if (storedTheme) document.documentElement.setAttribute("data-theme", storedTheme);

  // First render (and chart setup)
  render();
})();
