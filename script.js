"use strict";

const PUBCHEM_BASE = "https://pubchem.ncbi.nlm.nih.gov/rest/pug";

const searchForm = document.getElementById("searchForm");
const moleculeInput = document.getElementById("moleculeInput");
const resultPanel = document.getElementById("resultPanel");
const menuButton = document.getElementById("menuButton");
const navLinks = document.getElementById("navLinks");

const searchProperties = [
    "MolecularFormula",
    "MolecularWeight",
    "IUPACName",
    "CanonicalSMILES",
    "IsomericSMILES",
    "InChI",
    "XLogP",
    "TPSA",
    "HBondDonorCount",
    "HBondAcceptorCount",
    "Complexity"
];

let searchController = null;

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);
}

function displayValue(value, suffix = "") {
    if (value === null || value === undefined || value === "") {
        return "Not available";
    }

    return `${value}${suffix}`;
}

function formatProperty(value) {
    if (value === null || value === undefined || value === "") {
        return null;
    }

    if (typeof value === "object") {
        if ("Value" in value) {
            return value.Value;
        }

        return JSON.stringify(value);
    }

    return value;
}

function showMessage(title, message) {
    resultPanel.innerHTML = `
        <div class="result-error">
            <h3>${escapeHTML(title)}</h3>
            <p>${escapeHTML(message)}</p>
        </div>
    `;
}

function showLoading(name) {
    resultPanel.innerHTML = `
        <div class="result-placeholder">
            <div class="placeholder-icon">⌕</div>
            <h3>Exploring ${escapeHTML(name)}...</h3>
            <p>Retrieving available chemical information from PubChem.</p>
        </div>
    `;
}

async function fetchJSON(url, signal) {
    const response = await fetch(url, {
        signal,
        headers: { "Accept": "application/json" }
    });

    if (!response.ok) {
        throw new Error(
            response.status === 404
                ? "No matching record was found."
                : `The chemical database returned status ${response.status}.`
        );
    }

    return response.json();
}

async function searchMolecule(query) {
    const name = query.trim();

    if (!name) {
        showMessage("Enter a molecule", "Type a molecule name, formula, or SMILES to search.");
        return;
    }

    if (searchController) {
        searchController.abort();
    }

    searchController = new AbortController();
    const signal = searchController.signal;

    showLoading(name);

    try {
        // PubChem supports name and many chemical identifier searches.
        const encodedQuery = encodeURIComponent(name);

        const cidURL =
            `${PUBCHEM_BASE}/compound/name/${encodedQuery}/cids/JSON`;

        const cidData = await fetchJSON(cidURL, signal);

        const cids = cidData?.IdentifierList?.CID;

        if (!Array.isArray(cids) || cids.length === 0) {
            throw new Error("No matching molecule was found.");
        }

        const cid = cids[0];

        const propertyURL =
            `${PUBCHEM_BASE}/compound/cid/${cid}/property/` +
            `${searchProperties.join(",")}/JSON`;

        const propertyData = await fetchJSON(propertyURL, signal);

        if (signal.aborted) return;

        const properties = propertyData?.PropertyTable?.Properties?.[0];

        if (!properties) {
            throw new Error("The molecule was found, but its properties are unavailable.");
        }

        renderMolecule(name, cid, properties);

    } catch (error) {
        if (error.name === "AbortError") return;

        console.error("Molecule search failed:", error);

        showMessage(
            "Unable to retrieve molecule information",
            error.message.includes("Failed to fetch")
                ? "Please check your internet connection. If the problem continues, the browser may be blocking the database request."
                : error.message || "Please try another molecule or try again later."
        );
    }
}

function renderMolecule(searchTerm, cid, properties) {
    const formula = displayValue(properties.MolecularFormula);
    const weight = displayValue(properties.MolecularWeight, " g/mol");
    const iupac = displayValue(properties.IUPACName);
    const smiles = displayValue(properties.CanonicalSMILES);
    const inchi = displayValue(properties.InChI);
    const xlogp = displayValue(properties.XLogP);
    const tpsa = displayValue(properties.TPSA, " Å²");
    const donors = displayValue(properties.HBondDonorCount);
    const acceptors = displayValue(properties.HBondAcceptorCount);
    const complexity = displayValue(properties.Complexity);

    const pubchemURL =
        `https://pubchem.ncbi.nlm.nih.gov/compound/${encodeURIComponent(cid)}`;

    const structureURL =
        `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${encodeURIComponent(cid)}/PNG`;

    resultPanel.innerHTML = `
        <div class="molecule-result">
            <span class="section-label">PUBCHEM MOLECULE RECORD</span>

            <h3>${escapeHTML(searchTerm)}</h3>

            <p class="result-subtitle">
                PubChem CID: ${escapeHTML(cid)}
            </p>

            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:24px;margin-top:25px;align-items:start">

                <div style="text-align:center">
                    <img
                        src="${structureURL}"
                        alt="2D structure of ${escapeHTML(searchTerm)}"
                        style="max-width:100%;width:230px;height:auto;background:white;border:1px solid #e5ebf5;border-radius:12px;padding:12px"
                        loading="lazy"
                        onerror="this.style.display='none'">
                    <p class="result-note">2D structure, when available</p>
                </div>

                <div>
                    <p style="font-size:11px;color:#718099">MOLECULAR FORMULA</p>
                    <h2 style="font-size:27px;margin:4px 0 17px">${escapeHTML(formula)}</h2>

                    <p style="font-size:11px;color:#718099">MOLECULAR WEIGHT</p>
                    <h3 style="font-size:19px;margin:4px 0 17px">${escapeHTML(weight)}</h3>

                    <p style="font-size:11px;color:#718099">IUPAC NAME</p>
                    <p style="font-size:12px;overflow-wrap:anywhere;margin-top:5px">${escapeHTML(iupac)}</p>
                </div>
            </div>

            <div class="result-properties">
                <div class="property-item">
                    <span>XLogP</span>
                    <strong>${escapeHTML(xlogp)}</strong>
                </div>

                <div class="property-item">
                    <span>Topological Polar Surface Area</span>
                    <strong>${escapeHTML(tpsa)}</strong>
                </div>

                <div class="property-item">
                    <span>Hydrogen Bond Donors</span>
                    <strong>${escapeHTML(donors)}</strong>
                </div>

                <div class="property-item">
                    <span>Hydrogen Bond Acceptors</span>
                    <strong>${escapeHTML(acceptors)}</strong>
                </div>

                <div class="property-item">
                    <span>Molecular Complexity</span>
                    <strong>${escapeHTML(complexity)}</strong>
                </div>

                <div class="property-item">
                    <span>PubChem CID</span>
                    <strong>${escapeHTML(cid)}</strong>
                </div>
            </div>

            <div style="margin-top:22px">
                <p style="font-size:11px;color:#718099;margin-bottom:6px">CANONICAL SMILES</p>
                <p style="font-size:12px;overflow-wrap:anywhere;background:white;border:1px solid #e5ebf5;padding:12px;border-radius:10px">${escapeHTML(smiles)}</p>
            </div>

            <div style="margin-top:18px">
                <p style="font-size:11px;color:#718099;margin-bottom:6px">INCHI</p>
                <p style="font-size:12px;overflow-wrap:anywhere;background:white;border:1px solid #e5ebf5;padding:12px;border-radius:10px">${escapeHTML(inchi)}</p>
            </div>

            <p class="result-note">
                Data source:
                <a href="${pubchemURL}" target="_blank" rel="noopener noreferrer">View the PubChem record ↗</a>
            </p>

            <p class="result-note">
                Only properties returned by PubChem are shown. Missing data does not mean the property is zero.
            </p>
        </div>
    `;
}

searchForm.addEventListener("submit", event => {
    event.preventDefault();
    searchMolecule(moleculeInput.value);
});

document.querySelectorAll("[data-molecule]").forEach(button => {
    button.addEventListener("click", () => {
        const name = button.dataset.molecule;

        moleculeInput.value = name;
        searchMolecule(name);

        document.getElementById("explorer").scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
    });
});

menuButton.addEventListener("click", () => {
    const isOpen = navLinks.classList.toggle("open");

    menuButton.setAttribute("aria-expanded", String(isOpen));
    menuButton.textContent = isOpen ? "✕" : "☰";
});

navLinks.querySelectorAll("a").forEach(link => {
    link.addEventListener("click", () => {
        navLinks.classList.remove("open");
        menuButton.setAttribute("aria-expanded", "false");
        menuButton.textContent = "☰";
    });
});