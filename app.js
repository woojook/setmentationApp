// ==========================================
// CONFIGURATION & DROPBOX API CREDENTIALS
// ==========================================

const DROPBOX_CLIENT_ID = "YOUR_DROPBOX_APP_KEY";
const DROPBOX_REFRESH_TOKEN = "YOUR_DROPBOX_REFRESH_TOKEN";
const DROPBOX_CLIENT_SECRET = "YOUR_DROPBOX_APP_SECRET"; // Optional if Public App

// Fallback short-lived token (if refresh token not used)
let DROPBOX_ACCESS_TOKEN = "YOUR_DROPBOX_ACCESS_TOKEN_HERE";

// Multi-Document Manifest
const DOCUMENTS_MANIFEST = [
    {
        title: "guadalupe_example",
        url: "https://www.dropbox.com/scl/fi/syvetvr94xw6mfkg8i353/segmentation-Sheet1.csv?rlkey=vfefakigx8ajt7ccyuyoa5nln&st=g62eejl4&raw=1"
    // Add additional treaty documents here:
    // { title: "treaty_bilateral_2024", url: "https://www.dropbox.com/..." }
];

// Files stored on Dropbox
const DROPBOX_CSV_SAVE_PATH = "/annotations.csv";
const DROPBOX_REFERENCE_CUTS_PATH = "/reference_cuts.json";
const DROPBOX_RECONCILED_PATH = "/reconciled_consensus.json";

const CURRENT_USER = "woojo";
let CURRENT_DOCUMENT = DOCUMENTS_MANIFEST[0];

// ==========================================
// CONSTANTS & TAXONOMY
// ==========================================

const annotationTypes = [
    "Select a category...",
    "Motivation/Preamble",
    "Obligation (to Other States)",
    "Exceptions / Rights",
    "Definitions / Scope",
    "Data/Info Exchange",
    "Verifying Compliance",
    "Process - Entry in Force",
    "Process - Disputes/Courts",
    "Process - Amendments/Mods",
    "Process - Right to Withdraw",
    "Process - Expiration/Terminate",
    "Process - Renewals",
    "Administrative - Table of Contents",
    "Administrative - Definitions",
    "Administrative - Tables/Maps",
    "Administrative - Measures/Specs",
    "Administrative - Financial",
    "Administrative - Signature/End",
    "Administrative - Other",
    "NONBINDING INSTRUMENTS (letters/statements/negotiations)",
    "[START OF SECTION/CHAPTER (title)]",
    "[START ANNEX/SCHEDULE/ATTACHMENT (title)]",
    "[START ENTIRELY NEW DOCUMENT (title)]",
    "ACCIDENTAL CLICK (DELETE)",
    "Other - None of Above"
];

const problemsEncountered = [
    "None",
    "Text incomplete",
    "Text rendered improperly",
    "Text is in a different language",
    "Confused about segmentation",
    "Contains an annex",
    "Is an annex (annex only)",
    "Contained more than one document/annex",
    "Probably not a binding agreement",
    "Other"
];

// ==========================================
// DOM ELEMENTS
// ==========================================

const docSelector = document.getElementById('doc-selector');
const textContainer = document.getElementById('text-container');
const exportBtn = document.getElementById('export-btn');
const outputConsole = document.getElementById('output-console');
const annotationContainer = document.getElementById('annotation-container');
const segmentsList = document.getElementById('segments-list');
const reviewBtn = document.getElementById('review-btn');
const backBtn = document.getElementById('back-btn');
const submitBtn = document.getElementById('submit-btn');
const problemsDropdown = document.getElementById('problems-dropdown');
const clearBtn = document.getElementById('clear-btn');
const reconcileContainer = document.getElementById('reconcile-container');
const reconcileList = document.getElementById('reconcile-list');
const saveConsensusBtn = document.getElementById('save-consensus-btn');

// ==========================================
// STATE MANAGEMENT
// ==========================================

let wordsArray = [];
let cuts = new Set();
let referenceData = null; // Coder 1 baseline record

// ==========================================
// DROPBOX HELPERS & TOKEN REFRESH
// ==========================================

function escapeCSV(val) {
    if (val === null || val === undefined) return '""';
    let str = String(val).replace(/"/g, '""');
    return `"${str}"`;
}

// Automatically fetch new access token using Refresh Token
async function ensureValidAccessToken() {
    if (!DROPBOX_REFRESH_TOKEN || DROPBOX_REFRESH_TOKEN === "YOUR_DROPBOX_REFRESH_TOKEN") {
        return; // Use static DROPBOX_ACCESS_TOKEN
    }

    try {
        const bodyParams = new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: DROPBOX_REFRESH_TOKEN,
            client_id: DROPBOX_CLIENT_ID
        });

        if (DROPBOX_CLIENT_SECRET && DROPBOX_CLIENT_SECRET !== "YOUR_DROPBOX_APP_SECRET") {
            bodyParams.append("client_secret", DROPBOX_CLIENT_SECRET);
        }

        const response = await fetch("https://api.dropbox.com/oauth2/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: bodyParams
        });

        if (response.ok) {
            const data = await response.json();
            DROPBOX_ACCESS_TOKEN = data.access_token;
        }
    } catch (e) {
        console.warn("Could not refresh token, falling back to static access token.", e);
    }
}

async function fetchDropboxFile(path) {
    await ensureValidAccessToken();
    try {
        const response = await fetch("https://content.dropboxapi.com/2/files/download", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${DROPBOX_ACCESS_TOKEN}`,
                "Dropbox-API-Arg": JSON.stringify({ path: path })
            }
        });
        if (response.ok) return await response.text();
        return null;
    } catch (err) {
        console.warn(`File ${path} not found on Dropbox.`, err);
        return null;
    }
}

async function saveDropboxFile(path, content, contentType = "application/octet-stream") {
    await ensureValidAccessToken();
    const response = await fetch("https://content.dropboxapi.com/2/files/upload", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${DROPBOX_ACCESS_TOKEN}`,
            "Dropbox-API-Arg": JSON.stringify({
                path: path,
                mode: "overwrite",
                autorename: false,
                mute: false
            }),
            "Content-Type": contentType
        },
        body: content
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Dropbox upload failed: ${errText}`);
    }
    return await response.json();
}

async function loadReferenceData() {
    referenceData = null;
    const jsonText = await fetchDropboxFile(DROPBOX_REFERENCE_CUTS_PATH);
    if (jsonText) {
        try {
            const allRefData = JSON.parse(jsonText);
            if (allRefData[CURRENT_DOCUMENT.title]) {
                referenceData = allRefData[CURRENT_DOCUMENT.title];
                console.log("Loaded reference baseline for:", CURRENT_DOCUMENT.title, referenceData);
            }
        } catch (e) {
            console.error("Error parsing reference cuts JSON:", e);
        }
    }
}

// ==========================================
// INITIALIZATION & DYNAMIC DOCUMENT SWITCHING
// ==========================================

function initDocumentSelector() {
    docSelector.innerHTML = "";
    DOCUMENTS_MANIFEST.forEach((doc, idx) => {
        const opt = document.createElement('option');
        opt.value = idx;
        opt.innerText = doc.title;
        docSelector.appendChild(opt);
    });

    docSelector.addEventListener('change', (e) => {
        CURRENT_DOCUMENT = DOCUMENTS_MANIFEST[e.target.value];
        loadDocumentData();
    });
}

function parseCSVRow(csvText) {
    let result = [];
    let insideQuote = false;
    let entry = '';
    
    for (let i = 0; i < csvText.length; i++) {
        let char = csvText[i];
        if (char === '"') {
            insideQuote = !insideQuote;
        } else if (char === ',' && !insideQuote) {
            result.push(entry.trim());
            entry = '';
        } else {
            entry += char;
        }
    }
    result.push(entry.trim());
    return result;
}

async function loadDocumentData() {
    outputConsole.innerText = `Loading "${CURRENT_DOCUMENT.title}"...`;
    outputConsole.style.color = "#3b82f6";
    reconcileContainer.style.display = "none";

    // Load cuts from LocalStorage per document
    cuts.clear();
    const saved = localStorage.getItem(`cuts_${CURRENT_DOCUMENT.title}`);
    if (saved) {
        cuts = new Set(JSON.parse(saved));
    }

    try {
        await loadReferenceData();

        const response = await fetch(CURRENT_DOCUMENT.url);
        if (!response.ok) throw new Error("Failed to load document text.");
        
        const csvData = await response.text();
        const lines = csvData.split('\n');
        
        if (lines.length > 1) {
            const rowData = parseCSVRow(lines[1]);
            const documentText = rowData[1] || rowData[0] || "";
            
            wordsArray = documentText.split(/\s+/).filter(word => word.length > 0);

            if (referenceData) {
                outputConsole.innerText = `Loaded "${CURRENT_DOCUMENT.title}". Baseline exists from [${referenceData.coder}].`;
                outputConsole.style.color = "#22c55e";
            } else {
                outputConsole.innerText = `Loaded "${CURRENT_DOCUMENT.title}". You are Coder 1 for this document.`;
                outputConsole.style.color = "#eab308";
            }
            renderText();
        }
    } catch (error) {
        console.error(error);
        outputConsole.innerText = "Error loading document data. Check URL/Console.";
        outputConsole.style.color = "#ef4444";
    }
}

function toggleCut(index) {
    if (cuts.has(index)) {
        cuts.delete(index); 
    } else {
        cuts.add(index); 
    }
    localStorage.setItem(`cuts_${CURRENT_DOCUMENT.title}`, JSON.stringify(Array.from(cuts)));
    renderText(); 
}

function renderText() {
    textContainer.innerHTML = ""; 

    wordsArray.forEach((word, index) => {
        const wordSpan = document.createElement('span');
        wordSpan.className = 'word';
        wordSpan.innerText = word + " ";
        
        if (cuts.has(index)) {
            wordSpan.classList.add('cut-after');
        }

        wordSpan.addEventListener('click', () => {
            toggleCut(index);
        });

        textContainer.appendChild(wordSpan);
    });
}

// ==========================================
// ICR CALCULATIONS (BOUNDARY & CATEGORY)
// ==========================================

exportBtn.addEventListener('click', async () => {
    const coderACuts = Array.from(cuts).sort((a, b) => a - b);
    
    if (coderACuts.length === 0) {
        outputConsole.innerText = "Please make at least one cut before grading!";
        outputConsole.style.color = "#ef4444"; 
        return;
    }

    // CODER 1 INITIAL SAVE
    if (!referenceData) {
        outputConsole.innerText = "Saving your cuts as document baseline...\nWaiting for Coder 2 review.";
        outputConsole.style.color = "#eab308";

        try {
            const jsonText = await fetchDropboxFile(DROPBOX_REFERENCE_CUTS_PATH);
            let refStore = jsonText ? JSON.parse(jsonText) : {};
            
            refStore[CURRENT_DOCUMENT.title] = {
                coder: CURRENT_USER,
                timestamp: new Date().toISOString(),
                cuts: coderACuts,
                annotations: []
            };

            await saveDropboxFile(DROPBOX_REFERENCE_CUTS_PATH, JSON.stringify(refStore, null, 2), "application/json");
            referenceData = refStore[CURRENT_DOCUMENT.title];
            
            alert("Baseline cuts saved! Waiting for second coder review.");
        } catch (err) {
            console.error("Failed to save baseline cuts:", err);
            outputConsole.innerText = "Error saving baseline cuts to Dropbox.";
            outputConsole.style.color = "#ef4444";
        }
        return;
    }

    // CODER 2 BOUNDARY ICR SCORE (Jaccard Index)
    const baselineCuts = referenceData.cuts;
    const sharedCuts = coderACuts.filter(cut => baselineCuts.includes(cut));
    const unionCuts = new Set([...coderACuts, ...baselineCuts]);
    
    const jaccardScore = (sharedCuts.length / unionCuts.size) * 100;

    let consoleMessage = `Boundary Agreement (Jaccard Index): ${jaccardScore.toFixed(1)}%\n`;
    consoleMessage += `Your Cuts: [${coderACuts.join(', ')}]\n`;
    consoleMessage += `Coder 1 (${referenceData.coder}) Cuts: [${baselineCuts.join(', ')}]`;

    if (jaccardScore >= 80) {
        outputConsole.style.color = "#22c55e"; 
        outputConsole.innerText = `PASS - HIGH BOUNDARY AGREEMENT!\n${consoleMessage}`;
    } else {
        outputConsole.style.color = "#ef4444"; 
        outputConsole.innerText = `RECONCILIATION REQUIRED (<80% Agreement)\n${consoleMessage}`;
        buildReconciliationView(coderACuts, baselineCuts);
    }
});

// Category-Level ICR Calculation (Cohen's Kappa Proxy)
function calculateCategoryICR(coder2Annotations) {
    if (!referenceData || !referenceData.annotations || referenceData.annotations.length === 0) {
        return null;
    }

    const c1Anns = referenceData.annotations;
    const c2Anns = coder2Annotations;
    const compareLength = Math.min(c1Anns.length, c2Anns.length);
    
    if (compareLength === 0) return null;

    let totalObservedMatches = 0;
    const categoryCountsC1 = {};
    const categoryCountsC2 = {};

    for (let i = 0; i < compareLength; i++) {
        const cat1 = c1Anns[i];
        const cat2 = c2Anns[i];

        if (cat1 === cat2) totalObservedMatches++;

        categoryCountsC1[cat1] = (categoryCountsC1[cat1] || 0) + 1;
        categoryCountsC2[cat2] = (categoryCountsC2[cat2] || 0) + 1;
    }

    // Observed Proportion Agreement (Po)
    const Po = totalObservedMatches / compareLength;

    // Expected Chance Agreement (Pe)
    let Pe = 0;
    const allCategories = new Set([...Object.keys(categoryCountsC1), ...Object.keys(categoryCountsC2)]);
    allCategories.forEach(cat => {
        const p1 = (categoryCountsC1[cat] || 0) / compareLength;
        const p2 = (categoryCountsC2[cat] || 0) / compareLength;
        Pe += (p1 * p2);
    });

    // Cohen's Kappa Coefficient (k)
    const kappa = Pe === 1 ? 1 : (Po - Pe) / (1 - Pe);
    const percentage = Po * 100;

    return {
        kappa: kappa.toFixed(2),
        percentage: percentage.toFixed(1),
        alignedSegmentsCount: compareLength
    };
}

// ==========================================
// RECONCILIATION & ADJUDICATION
// ==========================================

function buildReconciliationView(coderCuts, baseCuts) {
    reconcileContainer.style.display = "block";
    reconcileList.innerHTML = "";

    const unionCuts = Array.from(new Set([...coderCuts, ...baseCuts])).sort((a, b) => a - b);
    
    unionCuts.forEach(cutIdx => {
        const inCoder = coderCuts.includes(cutIdx);
        const inBase = baseCuts.includes(cutIdx);

        const row = document.createElement('div');
        row.style.padding = "10px";
        row.style.marginBottom = "8px";
        row.style.borderRadius = "4px";
        row.style.display = "flex";
        row.style.justifyContent = "space-between";
        row.style.alignItems = "center";

        const snippet = wordsArray.slice(Math.max(0, cutIdx - 2), cutIdx + 3).join(" ");

        if (inCoder && inBase) {
            row.style.backgroundColor = "#dcfce7";
            row.innerHTML = `<span><strong>Match at word ${cutIdx}:</strong> "...${snippet}..."</span> <span style="color:#16a34a; font-weight:bold;">Agreed Boundary</span>`;
        } else {
            row.style.backgroundColor = "#fee2e2";
            const source = inCoder ? `Only ${CURRENT_USER}` : `Only ${referenceData.coder}`;
            row.innerHTML = `
                <span><strong>Disagreement at word ${cutIdx}:</strong> "...${snippet}..." (${source})</span>
                <label><input type="checkbox" class="consensus-cut" value="${cutIdx}" ${inCoder ? "checked" : ""}> Keep in Final Consensus</label>
            `;
        }
        reconcileList.appendChild(row);
    });
}

if (saveConsensusBtn) {
    saveConsensusBtn.addEventListener('click', async () => {
        const consensusCheckboxes = document.querySelectorAll('.consensus-cut');
        const finalConsensusCuts = Array.from(consensusCheckboxes)
            .filter(cb => cb.checked)
            .map(cb => parseInt(cb.value))
            .sort((a, b) => a - b);

        try {
            const jsonText = await fetchDropboxFile(DROPBOX_RECONCILED_PATH);
            let reconStore = jsonText ? JSON.parse(jsonText) : {};

            reconStore[CURRENT_DOCUMENT.title] = {
                document: CURRENT_DOCUMENT.title,
                reconciledBy: CURRENT_USER,
                timestamp: new Date().toISOString(),
                consensusCuts: finalConsensusCuts
            };

            await saveDropboxFile(DROPBOX_RECONCILED_PATH, JSON.stringify(reconStore, null, 2), "application/json");
            outputConsole.innerText = "Reconciled consensus baseline saved successfully to Dropbox!";
            outputConsole.style.color = "#22c55e";
            alert("Consensus cuts successfully adjudicated and saved!");
        } catch (err) {
            console.error("Failed to save reconciled consensus:", err);
            alert("Failed to save reconciled consensus to Dropbox.");
        }
    });
}

if (clearBtn) {
    clearBtn.addEventListener('click', () => {
        if (confirm(`Delete all cuts for ${CURRENT_DOCUMENT.title}?`)) {
            cuts.clear();
            localStorage.removeItem(`cuts_${CURRENT_DOCUMENT.title}`);
            renderText();
            outputConsole.innerText = "All cuts cleared.";
            outputConsole.style.color = "#38bdf8";
        }
    });
}

problemsEncountered.forEach(problem => {
    const option = document.createElement('option');
    option.value = problem;
    option.innerText = problem;
    problemsDropdown.appendChild(option);
});

// ==========================================
// ANNOTATION VIEW & SUBMISSION
// ==========================================

reviewBtn.addEventListener('click', () => {
    textContainer.style.display = "none";
    reviewBtn.style.display = "none";
    if (clearBtn) clearBtn.style.display = "none";
    annotationContainer.style.display = "block";
    outputConsole.innerText = "";
    
    segmentsList.innerHTML = "";
    
    let segmentTexts = [];
    let currentSegment = [];
    
    wordsArray.forEach((word, index) => {
        currentSegment.push(word);
        if (cuts.has(index) || index === wordsArray.length - 1) {
            segmentTexts.push(currentSegment.join(" "));
            currentSegment = [];
        }
    });

    segmentTexts.forEach((text, i) => {
        const segmentBox = document.createElement('div');
        segmentBox.style.border = "1px solid #9ca3af";
        segmentBox.style.padding = "15px";
        segmentBox.style.marginBottom = "15px";
        segmentBox.style.borderRadius = "5px";
        segmentBox.style.backgroundColor = "#f9fafb";

        const segmentHeader = document.createElement('h4');
        segmentHeader.innerText = `Segment ${i + 1}`;
        segmentHeader.style.marginTop = "0";

        const textPara = document.createElement('p');
        textPara.innerText = text;

        const selectDropdown = document.createElement('select');
        selectDropdown.style.width = "100%";
        selectDropdown.style.padding = "8px";
        selectDropdown.className = "segment-annotation";
        
        annotationTypes.forEach(type => {
            const option = document.createElement('option');
            option.value = type;
            option.innerText = type;
            selectDropdown.appendChild(option);
        });

        segmentBox.appendChild(segmentHeader);
        segmentBox.appendChild(textPara);
        segmentBox.appendChild(selectDropdown);
        segmentsList.appendChild(segmentBox);
    });
});

backBtn.addEventListener('click', () => {
    annotationContainer.style.display = "none";
    textContainer.style.display = "block";
    reviewBtn.style.display = "inline-block";
    if (clearBtn) clearBtn.style.display = "inline-block";
});

submitBtn.addEventListener('click', async () => {
    const dropdowns = document.querySelectorAll('.segment-annotation');
    let chosenCategories = [];
    let isMissingAnnotation = false;

    dropdowns.forEach((dropdown) => {
        if (dropdown.value === "Select a category...") {
            isMissingAnnotation = true;
        }
        chosenCategories.push(dropdown.value);
    });

    if (isMissingAnnotation) {
        alert("Please select an annotation category for every segment.");
        return;
    }

    submitBtn.disabled = true;
    submitBtn.innerText = "Saving to Dropbox...";

    try {
        let segmentTexts = [];
        let currentSegment = [];
        wordsArray.forEach((word, index) => {
            currentSegment.push(word);
            if (cuts.has(index) || index === wordsArray.length - 1) {
                segmentTexts.push(currentSegment.join(" "));
                currentSegment = [];
            }
        });

        const now = new Date();
        const timestamp = now.toISOString();
        const currentDate = now.toISOString().split('T')[0];
        const finalProblem = problemsDropdown.value;
        const sortedCuts = Array.from(cuts).sort((a, b) => a - b);
        const codingString = `cut_${sortedCuts.join('_')}`;

        // Save categories to reference Store if Coder 1
        if (referenceData && referenceData.coder === CURRENT_USER) {
            const jsonText = await fetchDropboxFile(DROPBOX_REFERENCE_CUTS_PATH);
            let refStore = jsonText ? JSON.parse(jsonText) : {};
            refStore[CURRENT_DOCUMENT.title] = {
                coder: CURRENT_USER,
                timestamp: timestamp,
                cuts: sortedCuts,
                annotations: chosenCategories
            };
            await saveDropboxFile(DROPBOX_REFERENCE_CUTS_PATH, JSON.stringify(refStore, null, 2), "application/json");
        }

        // Calculate Category ICR if Coder 2
        let categoryIcrMsg = "";
        const catResults = calculateCategoryICR(chosenCategories);
        if (catResults) {
            categoryIcrMsg = `\nCategory Agreement: ${catResults.percentage}% (Cohen's Kappa: ${catResults.kappa})`;
        }

        // Save CSV TSV Rows
        const headers = ["timestamp", "segid", "user", "coding", "segment_id", "segment", "annotation_type", "annotation_other", "title", "date"];
        let existingCSV = await fetchDropboxFile(DROPBOX_CSV_SAVE_PATH) || "";
        let csvRows = [];

        if (!existingCSV.trim()) {
            csvRows.push(headers.join("\t"));
        } else {
            csvRows.push(existingCSV.trim());
        }

        segmentTexts.forEach((segmentText, i) => {
            const annotationType = chosenCategories[i];
            const segId = `SEG-${i + 1}`;
            
            const rowValues = [
                timestamp,
                segId,
                CURRENT_USER,
                codingString,
                i + 1,
                segmentText,
                annotationType,
                finalProblem,
                CURRENT_DOCUMENT.title,
                currentDate
            ];

            csvRows.push(rowValues.map(escapeCSV).join("\t"));
        });

        await saveDropboxFile(DROPBOX_CSV_SAVE_PATH, csvRows.join("\n"));

        outputConsole.innerText = `Successfully saved annotations to Dropbox!${categoryIcrMsg}`;
        outputConsole.style.color = "#22c55e";
        alert(`Annotations saved to Dropbox successfully!${categoryIcrMsg}`);

    } catch (error) {
        console.error("Error saving annotations:", error);
        outputConsole.innerText = "Failed to save annotations to Dropbox.";
        outputConsole.style.color = "#ef4444";
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = "Submit Final Annotations";
    }
});

// App Entry Point
initDocumentSelector();
loadDocumentData();