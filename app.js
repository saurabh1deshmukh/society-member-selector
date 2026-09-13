const DEFAULT_DATA = [
  { name: "Alice Johnson", years: "2023, 2024" }, // 2 terms -> Excluded / Neglected
  { name: "Bob Smith", years: "2022" },           // 1 term
  { name: "Charlie Brown", years: "2019" },        // 1 term
  { name: "Diana Prince", years: "" },            // 0 terms -> Tier 1 Fresh
  { name: "Evan Wright", years: "" },             // 0 terms -> Tier 1 Fresh
  { name: "Fiona Gallagher", years: "" },         // 0 terms -> Tier 1 Fresh
  { name: "George Clark", years: "2020" },        // 1 term
  { name: "Hannah Abbott", years: "" },           // 0 terms -> Tier 1 Fresh
  { name: "Ian Malcolm", years: "2017" },         // 1 term
  { name: "Julia Roberts", years: "2018, 2021" }, // 2 terms -> Excluded / Neglected
  { name: "Kevin Bacon", years: "" },             // 0 terms -> Tier 1 Fresh
  { name: "Laura Croft", years: "2016" }          // 1 term (Oldest served)
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

// Parses years, standardizes 2-digit years ('22 -> 2022), removes duplicates
function parseYears(raw) {
  if (raw === null || raw === undefined) return [];
  return String(raw)
    .split(/[,;\s\/\-]+/)
    .map(val => val.trim().replace(/^'/, ''))
    .map(val => parseInt(val, 10))
    .filter(y => !isNaN(y))
    .map(y => {
      if (y >= 0 && y <= 49) return 2000 + y;
      if (y >= 50 && y <= 99) return 1900 + y;
      return y;
    })
    .filter(y => y >= 1950 && y <= 2100)
    .filter((y, idx, self) => self.indexOf(y) === idx)
    .sort((a, b) => a - b);
}

// Extract table data
function getTableData() {
  const rows = document.querySelectorAll('#owners-tbody tr');
  const data = [];
  rows.forEach(row => {
    const nameInput = row.querySelector('.owner-name');
    const yearsInput = row.querySelector('.owner-years');
    const name = nameInput ? nameInput.value.trim() : '';
    const yearsStr = yearsInput ? yearsInput.value.trim() : '';
    if (name || yearsStr) {
      data.push({ name, years: yearsStr });
    }
  });
  return data;
}

// Safe storage write with iOS Private Browsing guard
function persistData() {
  try {
    const data = getTableData();
    localStorage.setItem('owners_data', JSON.stringify(data));
  } catch (err) {
    console.warn("Storage write failed (Private mode or storage restricted):", err);
  }
}

// Build a single <tr> row
function createTableRow(name = '', years = '') {
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input type="text" class="owner-name" placeholder="Owner Name" value="${name}" /></td>
    <td><input type="text" class="owner-years" placeholder="e.g. 2021, 2023" value="${years}" /></td>
    <td style="text-align: center;">
      <button type="button" class="btn-delete" title="Remove row" aria-label="Remove">&times;</button>
    </td>
  `;
  return tr;
}

// ==========================================
// SELECTION ALGORITHM
// ==========================================
function runCommitteeSelection(ownersList, targetCount, targetYear) {
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
      const combined = Array.from(new Set([...existing.years, ...parsed])).sort((a, b) => a - b);
      existing.years = combined;
      if (hasRawText && combined.length === 0) {
        existing.hasUnparsedHistory = true;
      }
    }
  });

  const uniqueOwners = Array.from(dedupMap.values());

  const zeroTermOwners = [];
  const singleTermOwners = [];
  const multiTermOwners = [];
  const currentlyServing = [];

  uniqueOwners.forEach(item => {
    // Exclude member if they already served in the requested selection year
    if (item.years.includes(targetYear)) {
      currentlyServing.push({ name: item.name });
      return;
    }

    let tenureCount = item.years.length;
    if (tenureCount === 0 && item.hasUnparsedHistory) {
      tenureCount = 1;
    }

    const lastServedYear = item.years.length > 0 ? Math.max(...item.years) : null;
    const yearsSinceLastService = lastServedYear ? (targetYear - lastServedYear) : null;

    const ownerObj = {
      name: item.name,
      tenureCount: tenureCount,
      lastServedYear: lastServedYear,
      yearsSinceLastService: yearsSinceLastService,
      allYears: item.years
    };

    if (tenureCount === 0) {
      zeroTermOwners.push(ownerObj);
    } else if (tenureCount === 1) {
      singleTermOwners.push(ownerObj);
    } else {
      multiTermOwners.push(ownerObj);
    }
  });

  const selected = [];

  // TIER 1: Fresh owners (never served)
  const shuffledZero = shuffle(zeroTermOwners);
  const zeroToTake = Math.min(targetCount, shuffledZero.length);
  for (let i = 0; i < zeroToTake; i++) {
    selected.push({ ...shuffledZero[i], selectionReason: 'fresh' });
  }

  let remainingSlots = targetCount - selected.length;

  // TIER 2: Single-term owners (oldest service year drawn first)
  if (remainingSlots > 0 && singleTermOwners.length > 0) {
    const singleTermByYear = {};
    singleTermOwners.forEach(owner => {
      const yr = owner.lastServedYear || (targetYear - 1);
      if (!singleTermByYear[yr]) {
        singleTermByYear[yr] = [];
      }
      singleTermByYear[yr].push(owner);
    });

    const sortedYears = Object.keys(singleTermByYear)
      .map(Number)
      .sort((a, b) => a - b);

    for (const yr of sortedYears) {
      if (remainingSlots <= 0) break;

      const candidatesInYear = shuffle(singleTermByYear[yr]);
      const toPick = Math.min(remainingSlots, candidatesInYear.length);

      for (let i = 0; i < toPick; i++) {
        selected.push({ ...candidatesInYear[i], selectionReason: 'single_term' });
      }

      remainingSlots -= toPick;
    }
  }

  // TIER 3: Emergency fallback for multi-term members if quota cannot be fulfilled
  if (remainingSlots > 0 && multiTermOwners.length > 0) {
    multiTermOwners.sort((a, b) => {
      if (a.tenureCount !== b.tenureCount) return a.tenureCount - b.tenureCount;
      return (a.lastServedYear || targetYear) - (b.lastServedYear || targetYear);
    });

    const toPick = Math.min(remainingSlots, multiTermOwners.length);
    for (let i = 0; i < toPick; i++) {
      selected.push({ ...multiTermOwners[i], selectionReason: 'emergency_multiterm' });
    }
    remainingSlots -= toPick;
  }

  return {
    selected,
    totalEligible: uniqueOwners.length,
    zeroTermCount: zeroTermOwners.length,
    singleTermCount: singleTermOwners.length,
    multiTermExcludedCount: multiTermOwners.length,
    alreadyServingCount: currentlyServing.length
  };
}

// Spreadsheet reader
function handleFileUpload(file, tbody) {
  if (typeof XLSX === 'undefined') {
    alert('Spreadsheet engine not loaded. Please ensure you are connected to the internet.');
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });

      if (jsonData.length === 0) {
        alert('File contains no records.');
        return;
      }

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

      tbody.innerHTML = '';
      tbody.appendChild(fragment);
      persistData();
      alert(`Imported ${importedCount} owners.`);
    } catch (err) {
      console.error(err);
      alert('Could not parse file. Please upload a valid .xlsx, .xls, or .csv file.');
    }
  };
  reader.readAsArrayBuffer(file);
}

// Mobile-compatible file trigger
function triggerBlobDownload(blob, filename) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = url;
  a.download = filename;
  a.target = '_blank';
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    a.remove();
    window.URL.revokeObjectURL(url);
  }, 1000);
}

// Sample download handler
function downloadSampleFile() {
  const sampleRows = [
    { "Owner Name": "Alice Johnson", "Years Served": "2023, 2024" },
    { "Owner Name": "Bob Smith", "Years Served": "2022" },
    { "Owner Name": "Charlie Brown", "Years Served": "2019" },
    { "Owner Name": "Diana Prince", "Years Served": "" },
    { "Owner Name": "Evan Wright", "Years Served": "" },
    { "Owner Name": "Fiona Gallagher", "Years Served": "" },
    { "Owner Name": "George Clark", "Years Served": "2020" },
    { "Owner Name": "Hannah Abbott", "Years Served": "" },
    { "Owner Name": "Ian Malcolm", "Years Served": "2017" },
    { "Owner Name": "Julia Roberts", "Years Served": "2018, 2021" },
    { "Owner Name": "Kevin Bacon", "Years Served": "" },
    { "Owner Name": "Laura Croft", "Years Served": "2016" }
  ];

  if (typeof XLSX !== 'undefined') {
    try {
      const ws = XLSX.utils.json_to_sheet(sampleRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Owners");
      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      triggerBlobDownload(blob, "committee_sample.xlsx");
      return;
    } catch (e) {
      console.warn("SheetJS write failed, falling back to CSV", e);
    }
  }

  const csvHeaders = "Owner Name,Years Served\n";
  const csvBody = sampleRows.map(r => `"${r["Owner Name"]}","${r["Years Served"]}"`).join("\n");
  const csvBlob = new Blob([csvHeaders + csvBody], { type: 'text/csv;charset=utf-8;' });
  triggerBlobDownload(csvBlob, "committee_sample.csv");
}

// App Initialization
document.addEventListener('DOMContentLoaded', () => {
  const tbody = document.getElementById('owners-tbody');
  const addBtn = document.getElementById('add-row-btn');
  const fileInput = document.getElementById('excel-file-input');
  const downloadSampleBtn = document.getElementById('download-sample-btn');
  const submitBtn = document.getElementById('submit-btn');
  const countInput = document.getElementById('required-count');
  const yearInput = document.getElementById('selection-year');
  const resultsList = document.getElementById('results-list');
  const resultsMeta = document.getElementById('results-meta');

  // Dynamically set to current calendar year
  const currentYear = new Date().getFullYear();
  try {
    yearInput.value = localStorage.getItem('selection_year') || currentYear;
    countInput.value = localStorage.getItem('target_count') || '3';
  } catch (e) {
    yearInput.value = currentYear;
    countInput.value = '3';
  }

  // Load saved or seed data
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

  // Table event delegation
  tbody.addEventListener('input', (e) => {
    if (e.target.matches('.owner-name, .owner-years')) {
      persistData();
    }
  });

  tbody.addEventListener('click', (e) => {
    if (e.target.closest('.btn-delete')) {
      e.target.closest('tr').remove();
      persistData();
    }
  });

  // Add row
  addBtn.addEventListener('click', () => {
    const row = createTableRow();
    tbody.appendChild(row);
    const input = row.querySelector('.owner-name');
    if (input) input.focus();
    persistData();
  });

  // File upload trigger via change listener
  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      handleFileUpload(file, tbody);
      fileInput.value = '';
    }
  });

  // Sample download
  if (downloadSampleBtn) {
    downloadSampleBtn.addEventListener('click', (e) => {
      e.preventDefault();
      downloadSampleFile();
    });
  }

  countInput.addEventListener('input', () => {
    try {
      localStorage.setItem('target_count', countInput.value);
    } catch (e) {}
  });

  yearInput.addEventListener('input', () => {
    try {
      localStorage.setItem('selection_year', yearInput.value);
    } catch (e) {}
  });

  // Run selection
  submitBtn.addEventListener('click', () => {
    const data = getTableData();
    const count = parseInt(countInput.value, 10);
    const targetYear = parseInt(yearInput.value, 10) || new Date().getFullYear();

    if (data.length === 0) {
      alert('Please add at least one owner name.');
      return;
    }

    if (isNaN(count) || count <= 0) {
      alert('Please enter a valid committee size.');
      return;
    }

    const result = runCommitteeSelection(data, count, targetYear);

    // Results rendering
    resultsList.innerHTML = '';
    resultsMeta.innerHTML = `
      <strong>${result.selected.length} of ${count}</strong> selected for Year ${targetYear}.<br/>
      <small style="display:block; margin-top: 4px;">
        Pool: ${result.totalEligible} &bull; Never served: ${result.zeroTermCount} &bull; 
        1-term pool: ${result.singleTermCount} &bull; 
        <span style="color: #ef4444;">Multi-term excluded: ${result.multiTermExcludedCount}</span>
      </small>
    `;

    result.selected.forEach(candidate => {
      const li = document.createElement('li');
      const nameSpan = document.createElement('strong');
      nameSpan.textContent = candidate.name;

      const badge = document.createElement('span');
      badge.classList.add('badge');

      if (candidate.selectionReason === 'fresh') {
        badge.classList.add('badge-fresh');
        badge.textContent = 'Never Served';
      } else if (candidate.selectionReason === 'single_term') {
        badge.classList.add('badge-tenure');
        const gap = candidate.yearsSinceLastService !== null ? `${candidate.yearsSinceLastService} yrs ago` : '';
        badge.textContent = `1 Term (${candidate.lastServedYear} \u2022 ${gap})`;
      } else {
        badge.style.backgroundColor = '#6b7280';
        badge.textContent = `Emergency: ${candidate.tenureCount} terms`;
      }

      li.appendChild(nameSpan);
      li.appendChild(badge);
      resultsList.appendChild(li);
    });

    if (result.selected.length < count) {
      const warningLi = document.createElement('li');
      warningLi.style.borderColor = '#ef4444';
      warningLi.style.color = '#ef4444';
      warningLi.textContent = `Notice: Only ${result.selected.length} candidates available across valid tiers.`;
      resultsList.appendChild(warningLi);
    }
  });
});