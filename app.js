// Default mock data to seed if nothing exists in storage
const DEFAULT_DATA = [
  { name: "Alice Johnson", years: "2023, 2024" },
  { name: "Bob Smith", years: "2022" },
  { name: "Charlie Brown", years: "2021" },
  { name: "Diana Prince", years: "" },
  { name: "Evan Wright", years: "" },
  { name: "Fiona Gallagher", years: "" },
  { name: "George Clark", years: "2020" },
  { name: "Hannah Abbott", years: "" }
];

// Fisher-Yates pure random shuffle
function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Parse user entered comma-separated years into an array of numbers
function parseYears(str) {
  if (!str) return [];
  return str
    .split(',')
    .map(y => parseInt(y.trim(), 10))
    .filter(y => !isNaN(y))
    .sort((a, b) => a - b);
}

// Extract rows from DOM table
function getTableData() {
  const rows = document.querySelectorAll('#owners-tbody tr');
  const data = [];
  rows.forEach(row => {
    const nameInput = row.querySelector('.owner-name');
    const yearsInput = row.querySelector('.owner-years');
    const name = nameInput ? nameInput.value.trim() : '';
    const yearsStr = yearsInput ? yearsInput.value.trim() : '';
    if (name) {
      data.push({ name, years: yearsStr });
    }
  });
  return data;
}

// Save current table state to localStorage
function persistData() {
  const data = getTableData();
  localStorage.setItem('owners_data', JSON.stringify(data));
}

// Render a single row
function createTableRow(name = '', years = '') {
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input type="text" class="owner-name" placeholder="Owner Name" value="${name}"></td>
    <td><input type="text" class="owner-years" placeholder="e.g. 2021, 2023" value="${years}"></td>
    <td><button type="button" class="btn-delete" title="Remove row">&times;</button></td>
  `;

  // Attach auto-save triggers
  tr.querySelectorAll('input').forEach(input => {
    input.addEventListener('input', persistData);
  });

  tr.querySelector('.btn-delete').addEventListener('click', () => {
    tr.remove();
    persistData();
  });

  return tr;
}

// Main selection algorithm
function runCommitteeSelection(ownersList, targetCount) {
  // Pre-calculate tenure metadata
  const evaluatedOwners = ownersList.map(item => {
    const yearsArr = parseYears(item.years);
    const tenureCount = yearsArr.length;
    const lastServedYear = tenureCount > 0 ? Math.max(...yearsArr) : null;

    return {
      name: item.name,
      tenureCount: tenureCount,
      lastServedYear: lastServedYear,
      allYears: yearsArr
    };
  });

  // Step 1: Divide into fresh (tenure = 0) vs past members (tenure > 0)
  const freshOwners = evaluatedOwners.filter(o => o.tenureCount === 0);
  const pastOwners = evaluatedOwners.filter(o => o.tenureCount > 0);

  const selected = [];

  // Randomly draw fresh candidates first
  const shuffledFresh = shuffle(freshOwners);
  const freshToTake = Math.min(targetCount, shuffledFresh.length);
  for (let i = 0; i < freshToTake; i++) {
    selected.push(shuffledFresh[i]);
  }

  let remainingSlots = targetCount - selected.length;

  // Step 2: Fallback logic - pick based on SHORTEST TENURE
  if (remainingSlots > 0 && pastOwners.length > 0) {
    // Group past members by tenure length (e.g. 1 term, 2 terms, etc.)
    const tenureBuckets = {};
    pastOwners.forEach(owner => {
      if (!tenureBuckets[owner.tenureCount]) {
        tenureBuckets[owner.tenureCount] = [];
      }
      tenureBuckets[owner.tenureCount].push(owner);
    });

    // Sort tenure counts ascending (1 term before 2 terms)
    const sortedTenures = Object.keys(tenureBuckets)
      .map(Number)
      .sort((a, b) => a - b);

    for (const tenure of sortedTenures) {
      if (remainingSlots <= 0) break;

      let bucket = tenureBuckets[tenure];

      // Within the same tenure count, prioritize those whose last term was longest ago
      const yearBuckets = {};
      bucket.forEach(owner => {
        if (!yearBuckets[owner.lastServedYear]) {
          yearBuckets[owner.lastServedYear] = [];
        }
        yearBuckets[owner.lastServedYear].push(owner);
      });

      // Sort past years ascending (older served years picked first)
      const sortedYears = Object.keys(yearBuckets)
        .map(Number)
        .sort((a, b) => a - b);

      for (const year of sortedYears) {
        if (remainingSlots <= 0) break;

        // Randomly select among candidates tied for tenure length & year
        const candidatePool = shuffle(yearBuckets[year]);
        const countToPick = Math.min(remainingSlots, candidatePool.length);

        for (let i = 0; i < countToPick; i++) {
          selected.push(candidatePool[i]);
        }

        remainingSlots -= countToPick;
      }
    }
  }

  return {
    selected,
    totalEligible: evaluatedOwners.length,
    freshAvailable: freshOwners.length
  };
}

// UI Initialization
document.addEventListener('DOMContentLoaded', () => {
  const tbody = document.getElementById('owners-tbody');
  const addBtn = document.getElementById('add-row-btn');
  const submitBtn = document.getElementById('submit-btn');
  const countInput = document.getElementById('required-count');
  const resultsList = document.getElementById('results-list');
  const resultsMeta = document.getElementById('results-meta');

  // Load existing data or initialize with default rows
  const savedData = localStorage.getItem('owners_data');
  const initialData = savedData ? JSON.parse(savedData) : DEFAULT_DATA;
  
  initialData.forEach(row => {
    tbody.appendChild(createTableRow(row.name, row.years));
  });

  countInput.value = localStorage.getItem('target_count') || '3';

  // Add new row button
  addBtn.addEventListener('click', () => {
    const row = createTableRow();
    tbody.appendChild(row);
    row.querySelector('.owner-name').focus();
  });

  countInput.addEventListener('input', () => {
    localStorage.setItem('target_count', countInput.value);
  });

  // Submit button handler
  submitBtn.addEventListener('click', () => {
    const data = getTableData();
    const count = parseInt(countInput.value, 10);

    if (data.length === 0) {
      alert('Please add at least one owner name to the table.');
      return;
    }

    if (isNaN(count) || count <= 0) {
      alert('Please enter a valid count greater than 0.');
      return;
    }

    const { selected, totalEligible, freshAvailable } = runCommitteeSelection(data, count);

    // Update UI
    resultsList.innerHTML = '';
    resultsMeta.textContent = `Selected ${selected.length} of ${count} required (Total owners: ${totalEligible}, Never served: ${freshAvailable})`;

    selected.forEach(candidate => {
      const li = document.createElement('li');

      const nameSpan = document.createElement('strong');
      nameSpan.textContent = candidate.name;

      const badge = document.createElement('span');
      badge.classList.add('badge');

      if (candidate.tenureCount === 0) {
        badge.classList.add('badge-fresh');
        badge.textContent = 'Never Served';
      } else {
        badge.classList.add('badge-tenure');
        badge.textContent = `Tenure: ${candidate.tenureCount} term(s) (Last: ${candidate.lastServedYear})`;
      }

      li.appendChild(nameSpan);
      li.appendChild(badge);
      resultsList.appendChild(li);
    });

    if (selected.length < count) {
      const warningLi = document.createElement('li');
      warningLi.style.borderColor = '#ef4444';
      warningLi.style.color = '#ef4444';
      warningLi.textContent = `All eligible owners have been selected (${selected.length} available).`;
      resultsList.appendChild(warningLi);
    }
  });
});