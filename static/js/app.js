let currentData = {
    travel: { mode: 'car', distance: 0 },
    energy: { level: 'low', acHours: 0, washingMachine: 0, location: 'urban', season: 'summer' },
    diet: {
        morning: { redMeat: 0, whiteMeat: 0, dairy: 0, plant: 0 },
        afternoon: { redMeat: 0, whiteMeat: 0, dairy: 0, plant: 0 },
        evening: { redMeat: 0, whiteMeat: 0, dairy: 0, plant: 0 },
        night: { redMeat: 0, whiteMeat: 0, dairy: 0, plant: 0 }
    }
};

let weeklyLineChart = null;

document.addEventListener('DOMContentLoaded', function() {
    // Expand only 'morning' diet by default, collapse others
    ['morning', 'afternoon', 'evening', 'night'].forEach(time => {
        if (time !== 'morning') {
            let row = document.querySelector('.meal-inputs-' + time);
            if (row) row.style.display = 'none';
            let arrow = document.getElementById('expand_' + time);
            if (arrow) arrow.innerHTML = '▶';
        }
    });
    initializeApp();
});

function toggleDietCard(time) {
    const row = document.querySelector('.meal-inputs-' + time);
    const arrow = document.getElementById('expand_' + time);
    if (row && arrow) {
        if (row.style.display === 'none') {
            row.style.display = 'flex';
            arrow.innerHTML = '▼';
        } else {
            row.style.display = 'none';
            arrow.innerHTML = '▶';
        }
    }
}

function initializeApp() {
    const today = new Date();
    const dateStr = today.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    const dateElement = document.getElementById('dashboardDate');
    if (dateElement) dateElement.textContent = dateStr;
    loadTodayData();
    loadStats();
    loadWeeklyTrends();
}

window.showScreen = function(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
};
window.showMainScreen = function(screenId) {
    showScreen(screenId);
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    if (typeof event !== "undefined" && event && event.currentTarget) {
        event.currentTarget.classList.add('active');
    }
    if (screenId === 'trendsScreen') loadWeeklyTrends();
    if (screenId === 'profileScreen') loadStats();
    if (screenId === 'dashboardScreen') loadTodayData();
};

// Save Travel / Energy / Diet
window.saveTravel = async function() {
    currentData.travel.mode = document.getElementById('travelMode').value;
    currentData.travel.distance = parseFloat(document.getElementById('travelDistance').value) || 0;
    await saveLog();
    showScreen('dashboardScreen');
};
window.saveEnergy = async function() {
    currentData.energy.level = document.getElementById('energyLevel').value;
    currentData.energy.acHours = parseFloat(document.getElementById('acHours').value) || 0;
    currentData.energy.washingMachine = parseFloat(document.getElementById('washingMachine').value) || 0;
    currentData.energy.location = document.getElementById('location').value;
    currentData.energy.season = document.getElementById('season').value;
    await saveLog();
    showScreen('dashboardScreen');
};

function toggleNoMeal(time) {
    const checked = document.getElementById(`noMeal_${time}`).checked;
    ['redMeat', 'whiteMeat', 'dairy', 'plant'].forEach(type => {
        const field = document.getElementById(`${type}_${time}`);
        field.value = 0;
        field.disabled = checked;
    });
}
window.saveDiet = async function(e) {
    if (e) e.preventDefault();
    ['morning', 'afternoon', 'evening', 'night'].forEach(time => {
        if (document.getElementById(`noMeal_${time}`).checked) {
            currentData.diet[time] = { redMeat: 0, whiteMeat: 0, dairy: 0, plant: 0 };
        } else {
            currentData.diet[time] = {
                redMeat: parseInt(document.getElementById(`redMeat_${time}`).value) || 0,
                whiteMeat: parseInt(document.getElementById(`whiteMeat_${time}`).value) || 0,
                dairy: parseInt(document.getElementById(`dairy_${time}`).value) || 0,
                plant: parseInt(document.getElementById(`plant_${time}`).value) || 0
            };
        }
    });
    await saveLog();
    showScreen('dashboardScreen');
};

async function loadTodayData() {
    try {
        const res = await fetch('/api/get-today');
        const data = await res.json();
        if (data.success && data.log) {
            currentData.travel = Object.assign({
                mode: 'car',
                distance: 0
            }, (data.log.travel || {}));
            currentData.energy = Object.assign({
                level: 'low',
                acHours: 0,
                washingMachine: 0,
                location: 'urban',
                season: 'summer'
            }, (data.log.energy || {}));
            currentData.diet = Object.assign({
                morning: { redMeat: 0, whiteMeat: 0, dairy: 0, plant: 0 },
                afternoon: { redMeat: 0, whiteMeat: 0, dairy: 0, plant: 0 },
                evening: { redMeat: 0, whiteMeat: 0, dairy: 0, plant: 0 },
                night: { redMeat: 0, whiteMeat: 0, dairy: 0, plant: 0 }
            }, (data.log.diet || {}));
            updateDashboard(data.log.co2);

            // Sync all input fields
            document.getElementById('travelMode').value = currentData.travel.mode;
            document.getElementById('travelDistance').value = currentData.travel.distance;
            document.getElementById('energyLevel').value = currentData.energy.level;
            document.getElementById('acHours').value = currentData.energy.acHours;
            document.getElementById('washingMachine').value = currentData.energy.washingMachine;
            document.getElementById('location').value = currentData.energy.location || "urban";
            document.getElementById('season').value = currentData.energy.season || "summer";
            ['morning', 'afternoon', 'evening', 'night'].forEach(time => {
                let meal = currentData.diet[time];
                if (!meal) meal = { redMeat: 0, whiteMeat: 0, dairy: 0, plant: 0 };
                ['redMeat', 'whiteMeat', 'dairy', 'plant'].forEach(type => {
                    document.getElementById(`${type}_${time}`).value = meal[type] || 0;
                });
                const total = (meal.redMeat || 0) + (meal.whiteMeat || 0) + (meal.dairy || 0) + (meal.plant || 0);
                document.getElementById(`noMeal_${time}`).checked = (total === 0);
                toggleNoMeal(time);
            });
        } else {
            updateDashboard({ travel: 0, energy: 0, diet: 0, total: 0 });
        }
    } catch (e) {}
}

// === ALWAYS-SHOW OUTPUT Dashboard ===
function updateDashboard(co2Data) {
    document.querySelector('.co2-card').innerHTML = `
        <div class="co2-label">Your Daily Score</div>
        <div class="co2-value"><span id="totalCO2">${typeof co2Data.total === "number" ? co2Data.total.toFixed(1) : '0.0'}</span></div>
        <div class="co2-label">kg CO₂</div>
        <div class="co2-status" id="statusBadge"></div>
    `;
    document.getElementById('totalCO2').textContent = (typeof co2Data.total === "number" ? co2Data.total.toFixed(1) : '0.0');
    document.getElementById('travelCO2').textContent = (typeof co2Data.travel === "number" ? co2Data.travel.toFixed(1) : '0.0');
    document.getElementById('energyCO2').textContent = (typeof co2Data.energy === "number" ? co2Data.energy.toFixed(1) : '0.0');
    document.getElementById('dietCO2').textContent = (typeof co2Data.diet === "number" ? co2Data.diet.toFixed(1) : '0.0');
    const badge = document.getElementById('statusBadge');
    if (!badge) return;
    if (co2Data.total < 5) {
        badge.textContent = '🌟 Excellent';
        badge.style.background = 'rgba(34,197,94,0.2)';
        badge.style.color = '#108255';
    } else if (co2Data.total < 10) {
        badge.textContent = '✅ Good';
        badge.style.background = 'rgba(250,204,21,0.18)';
        badge.style.color = '#755700';
    } else if (co2Data.total < 15) {
        badge.textContent = '⚠️ Moderate';
        badge.style.background = 'rgba(249,115,22,0.18)';
        badge.style.color = '#b76b10';
    } else {
        badge.textContent = '❌ High';
        badge.style.background = 'rgba(255,84,89,0.18)';
        badge.style.color = '#b8171f';
    }
    generateSuggestions(co2Data);
    updateBadges(co2Data.total);
}

function generateSuggestions(co2Data) {
    const container = document.getElementById('suggestionsContainer');
    if (!container) return;
    const suggestions = [];
    if (co2Data.travel > 5) suggestions.push({ icon: '🚶', text: 'Try walking or using public transport more often.' });
    if (co2Data.energy > 5) suggestions.push({ icon: '💡', text: 'Limit AC and washing machine time where possible.' });
    if (co2Data.diet > 10) suggestions.push({ icon: '🥗', text: 'Swap one meat or dairy meal for a plant-based alternative tomorrow.' });
    if (co2Data.total < 5) suggestions.push({ icon: '🌟', text: "Super low footprint! Keep it up!" });
    if (!suggestions.length) suggestions.push({ icon: '👍', text: "You're on track. Small steps matter!" });
    container.innerHTML = suggestions.map(function(s) {
        return '<div class="suggestion-card"><div class="suggestion-icon">' + s.icon + '</div><div class="suggestion-text">' + s.text + '</div></div>';
    }).join('');
}

function updateBadges(totalCO2) {
    fetch('/api/get-stats').then(function(res) { return res.json(); }).then(function(data) {
        if (!data.success) return;
        const streak = data.stats.streak;
        if (streak >= 3) document.getElementById('badge3day').classList.add('earned');
        if (streak >= 7) document.getElementById('badge7day').classList.add('earned');
        if (streak >= 30) document.getElementById('badge30day').classList.add('earned');
        if (totalCO2 < 5) document.getElementById('badgeLow').classList.add('earned');
    });
}

async function saveLog() {
    try {
        const res = await fetch('/api/save-log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(currentData)
        });
        const data = await res.json();
        if (data.success) {
            updateDashboard(data.co2);
            loadStats();
        }
    } catch (e) { alert('Error saving log.'); }
}

async function loadWeeklyTrends() {
    try {
        const res = await fetch('/api/get-weekly');
        const data = await res.json();
        if (data.success && data.logs.length > 0) renderWeeklyLineChart(data.logs);
    } catch (e) {}
}

function renderWeeklyLineChart(logs) {
    const ctx = document.getElementById('weeklyLineChart').getContext('2d');
    if (window._lineChart) window._lineChart.destroy();
    const today = new Date();
    let dates = [];
    let values = [];
    for (let i = 6; i >= 0; i--) {
        const dt = new Date(today);
        dt.setDate(today.getDate() - i);
        const dstr = dt.toISOString().slice(0, 10);
        dates.push(dt.toLocaleDateString('en-US', { weekday: 'short' }));
        const entry = logs.find(function(z) { return z.date === dstr; });
        values.push(entry ? entry.co2.total : 0);
    }
    window._lineChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: dates,
            datasets: [{
                label: "Total CO₂ (kg)",
                data: values,
                borderColor: "rgba(33,128,141,1)",
                backgroundColor: "rgba(33,128,141,0.11)",
                fill: true,
                tension: 0.32,
                pointRadius: 5,
                pointBackgroundColor: "rgba(50,184,198,1)"
            }]
        },
        options: {
            scales: { y: { beginAtZero: true } },
            plugins: { legend: { display: false } }
        }
    });
    updateComparison(values);
}

function updateComparison(values) {
    const recent = values.slice(-3);
    const older = values.slice(0, -3);
    if (!older.length || !recent.length) return;
    const recentAvg = recent.reduce(function(a, b) { return a + b; }, 0) / recent.length;
    const olderAvg = older.reduce(function(a, b) { return a + b; }, 0) / older.length;
    const improvement = olderAvg !== 0 ? ((olderAvg - recentAvg) / olderAvg * 100).toFixed(0) : 0;
    const comparisonText = document.getElementById('comparisonText');
    if (!comparisonText) return;
    if (improvement > 0) comparisonText.textContent = "🎉 You're down " + improvement + "% this week!";
    else if (improvement < 0) comparisonText.textContent = "Your footprint rose by " + Math.abs(improvement) + "%. Try our tips!";
    else comparisonText.textContent = "You're steady—keep at it! 🌟";
}

async function loadStats() {
    try {
        const res = await fetch('/api/get-stats');
        const data = await res.json();
        if (!data.success) return;
        document.getElementById('currentStreak').textContent = data.stats.streak + ' days';
        document.getElementById('totalDays').textContent = data.stats.total_days + ' days';
        document.getElementById('avgDaily').textContent = data.stats.avg_daily + ' kg';
    } catch (e) {}
}