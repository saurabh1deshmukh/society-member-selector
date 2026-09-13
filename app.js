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

// Splits by comma, semicolon, space, slashes, or dashes
function parseYears(raw) {
  if (raw === null || raw === undefined) return [];
  return String(raw)
    .split(/[,;\s\/\-]+/)
    .map(y => parseInt(y.trim(), 10))
    .filter(y => !isNaN(y) && y >= 1950 && y <= 2100)
    .filter((y, idx, self) => self.indexOf(y) === idx) // unique years per person
    .sort((a, b) => a - b);
}

// Read current data rows from HTML table
function getTableData() {
  const rows = document.querySelectorAll('#owners-tbody tr');
  const data = [];
  rows.forEach(row => {
    const nameInput = row.querySelector('.owner-name');
    const yearsInput = row.querySelector('.owner-years');
    const name = nameInput ? nameInput.value.trim() : '';
    const yearsStr = yearsInput ? yearsInput.value.trim() : '';
    
    // Save row if either name or years is entered, or if user intentionally left a blank row
    if (name || yearsStr) {
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

// Build a <tr> element
function createTableRow(name = '', years = '') {
  const tr = document.createElement('tr');

  const tdName = document.createElement('td');
  const inputName = document.createElement('input');
  inputName.type = 'text';
  inputName.className = 'owner-name';
  inputName.placeholder = 'Owner Name';
  inputName.value = name;
  inputName.addEventListener('input', persistData);
  tdName.appendChild(inputName);

  const tdYears = document.createElement('td');
  const inputYears = document.createElement('input');
  inputYears.type = 'text';
  inputYears.className = 'owner-years';
  inputYears.placeholder = 'e.g. 2021, 2023';
  inputYears.value = years;
  inputYears.addEventListener('input', persistData);
  tdYears.appendChild(inputYears);

  const tdAction = document.createElement('td');
  tdAction.style.textAlign = 'center';
  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'btn-delete';
  deleteBtn.title = 'Remove';
  deleteBtn.innerHTML = '&times;';
  deleteBtn.addEventListener('click', () => {
    tr.remove();
    persistData();
  });
  tdAction.appendChild(deleteBtn);

  tr.appendChild(tdName);
  tr.appendChild(tdYears);
  tr.appendChild(tdAction);

  return tr;
}

// Core Selection Algorithm
function runCommitteeSelection(ownersList, targetCount) {
  // 1. Deduplicate by owner name (case-insensitive) & consolidate years
  const dedupMap = new Map();
  ownersList.forEach(item => {
    const cleanName = item.name.trim();
    if (!cleanName) return;

    const lowerKey = cleanName.toLowerCase();
    const parsed = parseYears(item.years);
    const hasRawText = Boolean(item.years && item.years.trim().length > 0);

    if (!dedupMap.has(lowerKey)) {
      dedupMap.set(lowerKey, {
        name: cleanName,
        years: parsed,
        hasUnparsedHistory: hasRawText && parsed.length === 0
      });
    } else {
      const existing = dedupMap.get(lowerKey);
      const combinedYears = Array.from(new Set([...existing.years, ...parsed])).sort((a, b) => a - b);
      existing.years = combinedYears;
      if (hasRawText && combinedYears.length === 0) {
        existing.hasUnparsedHistory = true;
      }
    }
  });

  const uniqueOwners = Array.from(dedupMap.values());

  // 2. Evaluate tenure
  const evaluatedOwners = uniqueOwners.map(item => {
    let tenureCount = item.years.length;
    // Fallback: If user wrote non-empty text (e.g. "Served before") but no 4-digit years were found
    if (tenureCount === 0 && item.hasUnparsedHistory) {
      tenureCount = 1;
    }

    const lastServedYear = item.years.length > 0 ? Math.max(...item.years) : (item.hasUnparsedHistory ? 1900 : null);

    return {
      name: item.name,
      tenureCount: tenureCount,
      lastServedYear: lastServedYear,
      allYears: item.years
    };
  });

  // 3. Separate Tier 1 (Fresh: never served) and Tier 2 (Past members)
  const freshOwners = evaluatedOwners.filter(o => o.tenureCount === 0);
  const pastOwners = evaluatedOwners.filter(o => o.tenureCount > 0);

  const selected = [];

  // Pick fresh owners randomly first
  const shuffledFresh = shuffle(freshOwners);
  const freshToTake = Math.min(targetCount, shuffledFresh.length);
  for (let i = 0; i < freshToTake; i++) {
    selected.push(shuffledFresh[i]);
  }

  let remainingSlots = targetCount - selected.length;

  // 4. Fallback: Shortest tenure first (1 term before 2 terms, etc.)
  if (remainingSlots > 0 && pastOwners.length > 0) {
    const tenureBuckets = {};
    pastOwners.forEach(owner => {
      if (!tenureBuckets[owner.tenureCount]) {
        tenureBuckets[owner.tenureCount] = [];
      }
      tenureBuckets[owner.tenureCount].push(owner);
    });

    // Sort tenure count ascending (least terms first)
    const sortedTenures = Object.keys(tenureBuckets)
      .map(Number)
      .sort((a, b) => a - b);

    for (const tenure of sortedTenures) {
      if (remainingSlots <= 0) break;

      const bucket = tenureBuckets[tenure];

      // Within equal tenure, group by last year served (oldest first)
      const yearBuckets = {};
      bucket.forEach(owner => {
        const yr = owner.lastServedYear || 1900;
        if (!yearBuckets[yr]) {
          yearBuckets[yr] = [];
        }
        yearBuckets[yr].push(owner);
      });

      const sortedYears = Object.keys(yearBuckets)
        .map(Number)
        .sort((a, b) => a - b);

      for (const year of sortedYears) {
        if (remainingSlots <= 0) break;

        // Shuffle candidates tied for same tenure count and last served year
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

// Process Excel/CSV File
function handleFileUpload(file, tbody) {
  const reader = new FileReader();

  reader.onload = (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

      if (jsonData.length === 0) {
        alert('The uploaded sheet contains no readable records.');
        return;
      }

      // Use DocumentFragment for performant DOM batch update
      const fragment = document.createDocumentFragment();
      let importedCount = 0;

      jsonData.forEach(row => {
        const keys = Object.keys(row);
        const nameKey = keys.find(k => /name|owner|member/i.test(k)) || keys[0];
        const yearsKey = keys.find(k => /year|tenure|served|history/i.test(k)) || keys[1];

        const name = row[nameKey] !== undefined ? String(row[nameKey]).trim() : '';
        const years = yearsKey && row[yearsKey] !== undefined ? String(row[yearsKey]).trim() : '';

        if (name) {
          fragment.appendChild(createTableRow(name, years));
          importedCount++;
        }
      });

      if (importedCount === 0) {
        alert('Could not find valid owner names in the file.');
        return;
      }

      tbody.innerHTML = '';
      tbody.appendChild(fragment);
      persistData();
      alert(`Imported ${importedCount} owners from file.`);
    } catch (err) {
      console.error(err);
      alert('Failed to parse file. Make sure it is a valid .xlsx, .xls, or .csv file.');
    }
  };

  reader.readAsArrayBuffer(file);
}

// App Bootstrap
document.addEventListener('DOMContentLoaded', () => {
  const tbody = document.getElementById('owners-tbody');
  const addBtn = document.getElementById('add-row-btn');
  const uploadBtn = document.getElementById('upload-btn');
  const fileInput = document.getElementById('excel-file-input');
  const submitBtn = document.getElementById('submit-btn');
  const countInput = document.getElementById('required-count');
  const resultsList = document.getElementById('results-list');
  const resultsMeta = document.getElementById('results-meta');

  // Populate saved or default data
  let savedData = null;
  try {
    savedData = JSON.parse(localStorage.getItem('owners_data'));
  } catch (e) {
    savedData = null;
  }

  const initialData = (savedData && Array.isArray(savedData) && savedData.length > 0) 
    ? savedData 
    : DEFAULT_DATA;

  const fragment = document.createDocumentFragment();
  initialData.forEach(item => {
    fragment.appendChild(createTableRow(item.name, item.years));
  });
  tbody.appendChild(fragment);

  countInput.value = localStorage.getItem('target_count') || '3';

  // Add Row Button
  addBtn.addEventListener('click', () => {
    const row = createTableRow();
    tbody.appendChild(row);
    const input = row.querySelector('.owner-name');
    if (input) input.focus();
  });

  // File Upload Handlers
  uploadBtn.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      handleFileUpload(file, tbody);
      fileInput.value = '';
    }
  });

  countInput.addEventListener('input', () => {
    localStorage.setItem('target_count', countInput.value);
  });

  // Selection Generation Trigger
  submitBtn.addEventListener('click', () => {
    const data = getTableData();
    const count = parseInt(countInput.value, 10);

    if (data.length === 0) {
      alert('Please add at least one owner name.');
      return;
    }

    if (isNaN(count) || count <= 0) {
      alert('Please enter a valid committee size (1 or more).');
      return;
    }

    const { selected, totalEligible, freshAvailable } = runCommitteeSelection(data, count);

    // Render results
    resultsList.innerHTML = '';
    resultsMeta.textContent = `Selected ${selected.length} of ${count} requested (Total pool: ${totalEligible}, Never served: ${freshAvailable})`;

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
        const lastYrDisplay = candidate.lastServedYear && candidate.lastServedYear !== 1900 
          ? candidate.lastServedYear 
          : 'Unknown';
        badge.textContent = `Tenure: ${candidate.tenureCount} term(s) (Last: ${lastYrDisplay})`;
      }

      li.appendChild(nameSpan);
      li.appendChild(badge);
      resultsList.appendChild(li);
    });

    if (selected.length < count) {
      const warningLi = document.createElement('li');
      warningLi.style.borderColor = '#ef4444';
      warningLi.style.color = '#ef4444';
      warningLi.textContent = `Notice: Only ${selected.length} eligible candidates available in total.`;
      resultsList.appendChild(warningLi);
    }
  });
});