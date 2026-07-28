const catalog = {
  "Reach Stacker": {
    SANY: ["SRSC45H1", "SRSC45H2", "SRSC4535", "SRSC45H9"],
    Konecranes: ["SMV4531TB5", "SMV4531TB6", "SMV4531TC5"],
    Kalmar: ["DRF450-60S5", "DRG450-65S5", "DRG450-75S5"],
    Hyster: ["RS45-31CH", "RS46-41LS"],
    Liebherr: ["LRS 545"]
  },
  Forklift: {
    Toyota: ["8FD30", "8FD50", "8FD70"],
    Hyster: ["H3.5FT", "H5.0FT", "H16XM-12"],
    Konecranes: ["SMV 12-600 B", "SMV 16-1200 B"],
    Kalmar: ["DCG100-12", "DCG160-12"],
    SANY: ["SCP100C", "SCP160C"]
  },
  "Mobile Crane": {
    SANY: ["STC250", "STC500", "STC750", "STC1000"],
    Liebherr: ["LTM 1050", "LTM 1090", "LTM 1100"],
    XCMG: ["QY25K5", "QY50K", "QY70K"],
    Tadano: ["GR-250N", "GR-500EX", "ATF 100G-4"]
  },
  "Crawler Crane": {
    SANY: ["SCC550A", "SCC800A", "SCC1000A"],
    Liebherr: ["LR 1100", "LR 1200"],
    XCMG: ["XGC55", "XGC85"]
  },
  Excavator: {
    Caterpillar: ["320D", "320GC", "336"],
    Komatsu: ["PC200-8", "PC210-10", "PC300"],
    SANY: ["SY215C", "SY305C", "SY365H"],
    Volvo: ["EC210", "EC300", "EC350"],
    Hitachi: ["ZX200", "ZX350"]
  },
  "Wheel Loader": {
    Caterpillar: ["950H", "950GC", "966H"],
    Komatsu: ["WA380", "WA470"],
    SANY: ["SW956E", "SW978K"],
    Volvo: ["L90H", "L120H", "L150H"]
  },
  Bulldozer: {
    Caterpillar: ["D6R", "D7R", "D8R"],
    Komatsu: ["D65EX", "D85EX", "D155AX"],
    Shantui: ["SD16", "SD22", "SD32"]
  },
  "Motor Grader": {
    Caterpillar: ["140H", "140K", "140M"],
    Komatsu: ["GD655", "GD705"],
    SANY: ["STG170C", "STG190C"]
  },
  "Road Roller": {
    Bomag: ["BW211D", "BW213D"],
    Caterpillar: ["CS56B", "CS68B"],
    SANY: ["SSR120", "SSR220"]
  },
  "Dump Truck": {
    Sinotruk: ["HOWO 371", "HOWO 420"],
    Shacman: ["F3000", "X3000"],
    Volvo: ["FMX 420", "FMX 460"],
    Scania: ["P410", "G460"]
  },
  "Concrete Pump": {
    SANY: ["SYG5230THB", "SYG5360THB", "SYG5530THB"],
    Zoomlion: ["ZLJ5330THB", "ZLJ5440THB"],
    Schwing: ["S 36 X", "S 42 SX"]
  },
  Truck: {
    Volvo: ["FM", "FMX", "FH"],
    Scania: ["P Series", "G Series", "R Series"],
    "Mercedes-Benz": ["Actros", "Arocs", "Axor"],
    Sinotruk: ["HOWO", "Sitrak"]
  },
  Generator: {
    Caterpillar: ["C9", "C13", "C15"],
    Cummins: ["6BT", "6CTA", "QSL9"],
    Perkins: ["1104A", "1106A", "2506A"]
  },
  Compressor: {
    Atlas_Copco: ["XAS 88", "XAS 186", "XAHS 408"],
    Ingersoll_Rand: ["7/41", "7/71", "9/235"]
  },
  Other: { Other: ["Other"] }
};

const form = document.getElementById("applicationForm");
const applicationType = document.getElementById("applicationType");
const customerFields = document.getElementById("customerFields");
const userFields = document.getElementById("userFields");
const machineType = document.getElementById("machineType");
const brand = document.getElementById("brand");
const model = document.getElementById("model");
const customBrand = document.getElementById("customBrand");
const customModel = document.getElementById("customModel");
const customBrandWrap = document.getElementById("customBrandWrap");
const customModelWrap = document.getElementById("customModelWrap");
const errorBox = document.getElementById("formError");
const submitButton = document.getElementById("submitButton");

function option(value, label = value) {
  const item = document.createElement("option");
  item.value = value;
  item.textContent = label.replaceAll("_", " ");
  return item;
}

Object.keys(catalog).forEach(type => machineType.appendChild(option(type)));

function setSectionEnabled(section, enabled) {
  section.classList.toggle("hidden", !enabled);
  section.querySelectorAll("input, select, textarea").forEach(field => {
    field.disabled = !enabled;
    if (field.dataset.required !== undefined) field.required = enabled;
  });
}

function updateRegistrationType() {
  const isCustomer = applicationType.value === "CUSTOMER";
  setSectionEnabled(customerFields, isCustomer);
  setSectionEnabled(userFields, !isCustomer);
  if (isCustomer) {
    brand.disabled = !machineType.value;
    model.disabled = !brand.value;
  }
}

applicationType.addEventListener("change", updateRegistrationType);
updateRegistrationType();

function resetSelect(select, label) {
  select.replaceChildren(option("", label));
}

machineType.addEventListener("change", () => {
  resetSelect(brand, "Select brand");
  resetSelect(model, "Select model");
  brand.disabled = !machineType.value;
  model.disabled = true;
  customBrandWrap.classList.add("hidden");
  customModelWrap.classList.add("hidden");
  customBrand.required = false;
  customModel.required = false;
  if (!machineType.value) return;
  Object.keys(catalog[machineType.value]).forEach(item => brand.appendChild(option(item)));
  if (!catalog[machineType.value].Other) brand.appendChild(option("Other"));
});

brand.addEventListener("change", () => {
  resetSelect(model, "Select model");
  customBrandWrap.classList.toggle("hidden", brand.value !== "Other");
  customBrand.required = brand.value === "Other";
  customModelWrap.classList.add("hidden");
  customModel.required = false;
  model.disabled = !brand.value;
  if (!brand.value) return;
  const models = catalog[machineType.value][brand.value] || ["Other"];
  models.forEach(item => model.appendChild(option(item)));
  if (!models.includes("Other")) model.appendChild(option("Other"));
});

model.addEventListener("change", () => {
  customModelWrap.classList.toggle("hidden", model.value !== "Other");
  customModel.required = model.value === "Other";
});

function showError(message) {
  errorBox.textContent = message;
  errorBox.classList.remove("hidden");
  errorBox.scrollIntoView({ behavior: "smooth", block: "center" });
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  errorBox.classList.add("hidden");
  if (!form.reportValidity()) return;

  const data = Object.fromEntries(new FormData(form).entries());
  if (data.applicationType === "CUSTOMER") {
    data.brand = data.brand === "Other" ? customBrand.value.trim() : data.brand.replaceAll("_", " ");
    data.model = data.model === "Other" ? customModel.value.trim() : data.model;
  }
  delete data.consent;

  submitButton.disabled = true;
  submitButton.textContent = "Submitting registration…";
  try {
    const response = await fetch("/api/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Could not submit the application.");

    document.getElementById("referenceNo").textContent = result.reference || "SUBMITTED";
    document.getElementById("applicationCard").classList.add("hidden");
    document.getElementById("successCard").classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (error) {
    showError(error.message || "Could not submit the application. Try again.");
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Submit registration request";
  }
});
