"use strict";

const PUBCHEM =
  "https://pubchem.ncbi.nlm.nih.gov/rest/pug";

const searchForm = document.getElementById("searchForm");
const moleculeInput = document.getElementById("moleculeInput");
const resultPanel = document.getElementById("resultPanel");
const menuButton = document.getElementById("menuButton");
const navLinks = document.getElementById("navLinks");

const SEARCH_PROPERTIES = [
  "MolecularFormula",
  "MolecularWeight",
  "IUPACName",
  "CanonicalSMILES",
  "ConnectivitySMILES",
  "SMILES",
  "InChI",
  "InChIKey",
  "XLogP",
  "TPSA",
  "HBondDonorCount",
  "HBondAcceptorCount",
  "Complexity",
  "ExactMass",
  "Charge"
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

function showMessage(title, message) {
  resultPanel.innerHTML = `
    <div class="result-error">
      <h3>${escapeHTML(title)}</h3>
      <p>${escapeHTML(message)}</p>
    </div>
  `;
}

function showLoading(query) {
  resultPanel.innerHTML = `
    <div class="result-placeholder">
      <h3>Exploring ${escapeHTML(query)}...</h3>
      <p>Retrieving molecular information from PubChem.</p>
    </div>
  `;

  resultPanel.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

async function fetchJSON(url, signal) {
  const response = await fetch(url, {
    signal,
    headers: { Accept: "application/json" }
  });

  if (!response.ok) {
    throw new Error(`PubChem returned HTTP ${response.status}`);
  }

  return response.json();
}

function getCIDs(data) {
  return data?.IdentifierList?.CID || [];
}

function isChemicalFormula(query) {
  return /^(?:[A-Z][a-z]?\d*){2,}$/.test(query);
}

function looksLikeSMILES(query) {
  // Examples: CCO, CC(=O)O, C1CCCCC1, c1ccccc1
  return (
    /^[A-Za-z0-9@+\-\[\]()=#$/\\%.:*]+$/.test(query) &&
    (
      /[()[\]=#@+\-\\/%.*:]/.test(query) ||
      /^[A-Z][A-Za-z]?$/.test(query) ||
      /^[A-Z][A-Za-z]?[A-Z]/.test(query) ||
      /^[cnohspb][0-9]/i.test(query) ||
      /[0-9]/.test(query)
    )
  );
}

async function findCID(query, signal) {
  const encoded = encodeURIComponent(query);

  // Chemical formulas should use PubChem's formula search.
  if (isChemicalFormula(query)) {
    try {
      const data = await fetchJSON(
        `${PUBCHEM}/compound/fastformula/${encoded}/cids/JSON`,
        signal
      );

      const cids = getCIDs(data);
      if (cids.length) return cids[0];
    } catch (error) {
      if (error.name === "AbortError") throw error;
    }
  }

  // First, try an ordinary molecule-name search.
  try {
    const data = await fetchJSON(
      `${PUBCHEM}/compound/name/${encoded}/cids/JSON`,
      signal
    );

    const cids = getCIDs(data);
    if (cids.length) return cids[0];
  } catch (error) {
    if (error.name === "AbortError") throw error;
  }

  // If name search fails, try interpreting the input as SMILES.
  if (looksLikeSMILES(query)) {
    const smiles = encodeURIComponent(query);

    try {
      const data = await fetchJSON(
        `${PUBCHEM}/compound/smiles/${smiles}/cids/JSON`,
        signal
      );

      const cids = getCIDs(data);
      if (cids.length) return cids[0];
    } catch (error) {
      if (error.name === "AbortError") throw error;
    }
  }

  return null;
}

async function getProperties(cid, signal) {
  const propertyList = SEARCH_PROPERTIES.join(",");
  const url =
    `${PUBCHEM}/compound/cid/${cid}/property/` +
    `${propertyList}/JSON`;

  const data = await fetchJSON(url, signal);
  const properties = data?.PropertyTable?.Properties?.[0];

  if (!properties) {
    throw new Error("PubChem did not return molecular properties.");
  }

  return properties;
}

function displayValue(value, suffix = "") {
  if (value === null || value === undefined || value === "") {
    return "Not available";
  }

  return `${value}${suffix}`;
}

function propertyCard(label, value, suffix = "") {
  return `
    <div class="property-card">
      <span class="property-label">${escapeHTML(label)}</span>
      <strong class="property-value">
        ${escapeHTML(displayValue(value, suffix))}
      </strong>
    </div>
  `;
}

function renderMolecule(properties) {
  const cid = properties.CID;
  const name = properties.IUPACName || `Molecule CID ${cid}`;
  const formula = properties.MolecularFormula || "Not available";

  // Use the actual canonical SMILES field returned by PubChem.
  const canonicalSMILES =
    properties.CanonicalSMILES ||
    properties.ConnectivitySMILES ||
    "";

  const isomericSMILES =
    properties.SMILES || properties.IsomericSMILES || "";
  const inchi = properties.InChI || "";
  const imageURL =
    `${PUBCHEM}/compound/cid/${cid}/PNG?image_size=large`;

  const pubchemURL =
    `https://pubchem.ncbi.nlm.nih.gov/compound/${cid}`;

  resultPanel.innerHTML = `
    <section class="molecule-result">
      <div class="result-heading">
        <p class="eyebrow">MOLECULE DISCOVERED</p>
        <h2>${escapeHTML(name)}</h2>
        <p>
          PubChem CID:
          <a href="${pubchemURL}"
             target="_blank"
             rel="noopener noreferrer">${cid}</a>
        </p>
      </div>

      <div class="molecule-structure">
        <img
          src="${imageURL}"
          alt="2D chemical structure of ${escapeHTML(name)}"
          loading="lazy"
          onerror="this.style.display='none';"
        >
      </div>

      <div class="molecule-summary">
        <h3>Basic Information</h3>
        <p><strong>Formula:</strong> ${escapeHTML(formula)}</p>
        <p><strong>Molecular weight:</strong>
          ${escapeHTML(displayValue(properties.MolecularWeight, " g/mol"))}
        </p>
        <p><strong>IUPAC name:</strong>
          ${escapeHTML(displayValue(properties.IUPACName))}
        </p>
      </div>

      <div class="property-grid">
        ${propertyCard("Exact mass", properties.ExactMass, " Da")}
        ${propertyCard("XLogP", properties.XLogP)}
        ${propertyCard("TPSA", properties.TPSA, " Å²")}
        ${propertyCard("H-bond donors", properties.HBondDonorCount)}
        ${propertyCard("H-bond acceptors", properties.HBondAcceptorCount)}
        ${propertyCard("Complexity", properties.Complexity)}
        ${propertyCard("Formal charge", properties.Charge)}
      </div>

      <div class="structure-data">
        <h3>Canonical SMILES</h3>
        ${
          canonicalSMILES
            ? `<code class="smiles-value">${escapeHTML(canonicalSMILES)}</code>
               <button type="button" class="copy-button"
                 data-copy="canonical">Copy SMILES</button>`
            : `<p>Canonical SMILES is not available from this PubChem record.</p>`
        }

        <h3>Isomeric SMILES</h3>
        ${
          isomericSMILES
            ? `<code class="smiles-value">${escapeHTML(isomericSMILES)}</code>
               <button type="button" class="copy-button"
                 data-copy="isomeric">Copy Isomeric SMILES</button>`
            : `<p>Isomeric SMILES is not available.</p>`
        }

        <h3>InChI</h3>
        ${
          inchi
            ? `<code class="smiles-value">${escapeHTML(inchi)}</code>`
            : `<p>InChI is not available.</p>`
        }
      </div>

      <p class="source-note">
        Source:
        <a href="${pubchemURL}"
           target="_blank"
           rel="noopener noreferrer">View the PubChem record</a>.
        Chemical data availability may vary by molecule.
      </p>
    </section>
  `;

  const copyButtons = resultPanel.querySelectorAll("[data-copy]");

  copyButtons.forEach(button => {
    button.addEventListener("click", async () => {
      const value = button.dataset.copy === "canonical"
        ? canonicalSMILES
        : isomericSMILES;

      try {
        await navigator.clipboard.writeText(value);
        button.textContent = "Copied!";
      } catch {
        showMessage(
          "Copy unavailable",
          "Please select and copy the SMILES text manually."
        );
      }
    });
  });
}

async function searchMolecule(rawQuery) {
  const query = rawQuery.trim();

  if (!query) {
    showMessage(
      "Enter a molecule",
      "Type a molecule name, chemical formula, or SMILES notation."
    );
    return;
  }

  if (searchController) {
    searchController.abort();
  }

  searchController = new AbortController();
  const signal = searchController.signal;

  showLoading(query);

  try {
    const cid = await findCID(query, signal);

    if (!cid) {
      showMessage(
        "Molecule not found",
        "No matching record was found. Check your spelling, formula, or SMILES notation."
      );
      return;
    }

    const properties = await getProperties(cid, signal);

    if (!signal.aborted) {
      renderMolecule(properties);
    }
  } catch (error) {
    if (error.name === "AbortError") return;

    console.error("Molecule search failed:", error);

    showMessage(
      "Unable to retrieve molecule data",
      "Please check your internet connection and try again. PubChem may also be temporarily unavailable."
    );
  }
}

if (searchForm && moleculeInput && resultPanel) {
  searchForm.addEventListener("submit", event => {
    event.preventDefault();
    searchMolecule(moleculeInput.value);
  });
}

// Popular molecule cards.
document.querySelectorAll("[data-molecule]").forEach(element => {
  element.addEventListener("click", () => {
    const molecule = element.dataset.molecule;

    if (moleculeInput) {
      moleculeInput.value = molecule;
    }

    searchMolecule(molecule);
  });
});

// Mobile navigation.
if (menuButton && navLinks) {
  menuButton.addEventListener("click", () => {
    const isOpen = navLinks.classList.toggle("active");
    menuButton.setAttribute("aria-expanded", String(isOpen));
  });

  navLinks.querySelectorAll("a").forEach(link => {
    link.addEventListener("click", () => {
      navLinks.classList.remove("active");
      menuButton.setAttribute("aria-expanded", "false");
    });
  });
                       }
