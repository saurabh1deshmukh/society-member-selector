// Fisher-Yates shuffle algorithm for uniform randomness
function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Normalize strings for case-insensitive matching
function cleanName(name) {
  return name.trim();
}

function parseHistory(historyRaw) {
  // Returns map: { "Owner Name": latestYearServed }
  const serviceMap = new Map();
  const lines = historyRaw.split("\n");

  lines.forEach((line) => {
    const parts = line.split(":");
    if (parts.length >= 2) {
      const year = parseInt(parts[0].trim(), 10);
      const members = parts[1].split(",").map(cleanName);

      if (!isNaN(year)) {
        members.forEach((member) => {
          if (member) {
            const existingYear = serviceMap.get(member);
            // Record the most recent year they served
            if (!existingYear || year > existingYear) {
              serviceMap.set(member, year);
            }
          }
        });
      }
    }
  });

  return serviceMap;
}

function runSelection() {
  const ownersRaw = document.getElementById("ownersInput").value;
  const historyRaw = document.getElementById("historyInput").value;
  const targetCount = parseInt(document.getElementById("targetCount").value, 10);

  const statusBox = document.getElementById("statusMessage");
  const resultsContainer = document.getElementById("resultsContainer");
  const statsContainer = document.getElementById("statsSummary");

  // Reset UI status
  statusBox.className = "status-box hidden";
  statusBox.textContent = "";

  // 1. Parse eligible owners
  const owners = [
    ...new Set(
      ownersRaw
        .split("\n")
        .map(cleanName)
        .filter((n) => n.length > 0)
    )
  ];

  if (owners.length === 0) {
    statusBox.textContent = "Please provide at least one owner.";
    statusBox.classList.remove("hidden");
    statusBox.classList.add("error");
    return;
  }

  if (isNaN(targetCount) || targetCount <= 0) {
    statusBox.textContent = "Please provide a valid committee size.";
    statusBox.classList.remove("hidden");
    statusBox.classList.add("error");
    return;
  }

  // 2. Parse past historical committees
  const historyMap = parseHistory(historyRaw);

  // 3. Separate fresh members from past members
  const freshCandidates = [];
  const pastCandidates = [];

  owners.forEach((owner) => {
    if (historyMap.has(owner)) {
      pastCandidates.push({
        name: owner,
        lastServed: historyMap.get(owner),
      });
    } else {
      freshCandidates.push(owner);
    }
  });

  const selected = [];

  // 4. Primary Selection: Pick from fresh candidates
  const shuffledFresh = shuffleArray(freshCandidates);
  const freshToPickCount = Math.min(shuffledFresh.length, targetCount);

  for (let i = 0; i < freshToPickCount; i++) {
    selected.push({
      name: shuffledFresh[i],
      reason: "Fresh (Never Served)",
      badgeClass: "fresh"
    });
  }

  // 5. Fallback Selection: Fill remaining quota by tenure
  let remainingSlots = targetCount - selected.length;

  if (remainingSlots > 0 && pastCandidates.length > 0) {
    // Group candidates by the year they last served
    const pastByYear = {};
    pastCandidates.forEach((cand) => {
      if (!pastByYear[cand.lastServed]) {
        pastByYear[cand.lastServed] = [];
      }
      pastByYear[cand.lastServed].push(cand.name);
    });

    // Sort years ascending: oldest tenure first
    const sortedYears = Object.keys(pastByYear)
      .map(Number)
      .sort((a, b) => a - b);

    for (const year of sortedYears) {
      if (remainingSlots <= 0) break;

      const candidatesFromThisYear = shuffleArray(pastByYear[year]);
      const pickCount = Math.min(candidatesFromThisYear.length, remainingSlots);

      for (let i = 0; i < pickCount; i++) {
        selected.push({
          name: candidatesFromThisYear[i],
          reason: `Tenure (Last served: ${year})`,
          badgeClass: "tenure"
        });
      }
      remainingSlots -= pickCount;
    }
  }

  // Render warnings if total pool was smaller than required count
  if (selected.length < targetCount) {
    statusBox.textContent = `Warning: Only ${selected.length} members could be selected out of the requested${targetCount} because the total pool was exhausted.`;
    statusBox.classList.remove("hidden");
    statusBox.classList.add("warn");
  }

  // Render Selected List
  renderResults(selected);

  // Render Stats
  statsContainer.innerHTML = `
    <strong>Pool Summary:</strong> Total Owners: ${owners.length} | 
    Fresh Pool: ${freshCandidates.length} | 
    Past Members: ${pastCandidates.length}
  `;
  statsContainer.classList.remove("hidden");
}

function renderResults(selectedMembers) {
  const resultsContainer = document.getElementById("resultsContainer");

  if (selectedMembers.length === 0) {
    resultsContainer.innerHTML = `<div class="empty-state">No members selected.</div>`;
    return;
  }

  const list = document.createElement("ul");
  list.className = "member-list";

  selectedMembers.forEach((member, index) => {
    const li = document.createElement("li");
    li.className = "member-item";
    li.innerHTML = `
      <span><strong>#${index + 1}</strong>${member.name}</span>
      <span class="badge ${member.badgeClass}">${member.reason}</span>
    `;
    list.appendChild(li);
  });

  resultsContainer.innerHTML = "";
  resultsContainer.appendChild(list);
}

// Attach event listener
document.getElementById("generateBtn").addEventListener("click", runSelection);