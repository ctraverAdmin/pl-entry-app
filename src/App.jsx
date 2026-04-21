import React, { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Briefcase,
  FileText,
  Laptop,
  Pencil,
  Plus,
  Save,
  Search,
  Shield,
  Trash2,
  Users,
  X,
} from "lucide-react";

const STORAGE_KEY = "pl_entry_jobs_v5";
const OVERHEAD_STORAGE_KEY = "pl_entry_overhead_v1";

const departmentOptions = [
  "Installation",
  "Design",
  "Network",
  "Sales",
  "Network Integration",
];

const overheadCategoryOptions = [
  "Time Off / PTO",
  "Benefits",
  "Payroll Taxes",
  "Bonuses",
  "Training",
  "Donations / Sponsorships",
  "Safety Supplies",
  "General Supplies",
  "Shirts / Apparel",
  "PCs / Equipment",
  "Office Expenses",
  "Miscellaneous Overhead",
];

const forecastConfidenceOptions = ["High", "Medium", "Low"];

const expenseGroups = [
  {
    title: "Materials & Job Costs",
    fields: [
      ["materials", "Materials"],
      ["tools", "Tools"],
      ["subcontractor", "Subcontractor"],
      ["freightDelivery", "Freight and Delivery"],
      ["thirdPartyJobMaterials", "Third Party Job Materials"],
      ["deliveryPickup", "Delivery and Pickup"],
      ["toolRental", "Tool Rental"],
      ["equipmentRepairs", "Equipment Repairs"],
      ["equipmentRentals", "Equipment Rentals"],
      ["equipmentFreight", "Equipment Freight"],
    ],
  },
  {
    title: "Travel Expenses",
    fields: [
      ["baggage", "Baggage"],
      ["flightChangeExpense", "Flight Change Expense"],
      ["seating", "Seating"],
      ["airfare", "Airfare"],
      ["carRental", "Car Rental"],
      ["gas", "Gas"],
      ["hotel", "Hotel"],
      ["parking", "Parking"],
      ["meals", "Meals"],
    ],
  },
  {
    title: "Wages",
    fields: [
      ["layover", "Layover"],
      ["regular", "Regular"],
      ["shiftDiff", "Shift Diff"],
      ["shiftDiffOT", "Shift Diff OT"],
      ["tmBid", "TM Bid"],
      ["travel", "Travel"],
      ["travelOT", "Travel OT"],
      ["mot", "MOT"],
      ["perDiem", "Per Diem"],
      ["drugTesting", "Drug Testing"],
    ],
  },
  {
    title: "Office / Misc",
    fields: [["miscOfficeExpenses", "Misc Office Expenses"]],
  },
];

const expenseFieldKeys = expenseGroups.flatMap((group) =>
  group.fields.map(([key]) => key)
);

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function toNumber(value) {
  const cleaned = String(value ?? "").replace(/[$,]/g, "").trim();
  const parsed = parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(value || 0));
}

function formatPercent(value) {
  return `${Number(value || 0).toFixed(2)}%`;
}

function freightPercentOfMaterials(freight, materials) {
  const freightValue = toNumber(freight);
  const materialsValue = toNumber(materials);
  if (materialsValue <= 0) return 0;
  return (freightValue / materialsValue) * 100;
}

function totalsForJobs(jobList) {
  return jobList.reduce(
    (acc, job) => {
      const calc = calculateJob(job);
      acc.sales += calc.sales;
      acc.totalExpenses += calc.totalExpenses;
      acc.profitLoss += calc.profitLoss;

      (job.lines || []).forEach((line) => {
        acc.materials += toNumber(line.materials);
        acc.freightDelivery += toNumber(line.freightDelivery);
      });

      return acc;
    },
    {
      sales: 0,
      totalExpenses: 0,
      profitLoss: 0,
      materials: 0,
      freightDelivery: 0,
    }
  );
}

function totalsForOverhead(entries) {
  return entries.reduce(
    (acc, entry) => {
      const amount = toNumber(entry.amount);
      acc.total += amount;

      if (
        [
          "Time Off / PTO",
          "Benefits",
          "Payroll Taxes",
          "Bonuses",
          "Training",
        ].includes(entry.category)
      ) {
        acc.people += amount;
      } else if (
        [
          "Safety Supplies",
          "General Supplies",
          "Shirts / Apparel",
          "PCs / Equipment",
          "Office Expenses",
        ].includes(entry.category)
      ) {
        acc.operating += amount;
      } else {
        acc.other += amount;
      }

      const now = new Date();
      const entryDate = entry.date ? new Date(entry.date) : null;

      if (entryDate && !Number.isNaN(entryDate.getTime())) {
        if (
          entryDate.getMonth() === now.getMonth() &&
          entryDate.getFullYear() === now.getFullYear()
        ) {
          acc.currentMonth += amount;
        }

        if (entryDate.getFullYear() === now.getFullYear()) {
          acc.ytd += amount;
        }
      }

      return acc;
    },
    {
      total: 0,
      people: 0,
      operating: 0,
      other: 0,
      currentMonth: 0,
      ytd: 0,
    }
  );
}

function overheadByDepartment(entries) {
  return departmentOptions.map((department) => {
    const departmentEntries = entries.filter((entry) => entry.department === department);
    const total = departmentEntries.reduce((sum, entry) => sum + toNumber(entry.amount), 0);
    return {
      department,
      total,
    };
  });
}

function buildDepartmentOverheadMap(entries) {
  return entries.reduce((acc, entry) => {
    const dept = entry.department || "Unknown";
    acc[dept] = (acc[dept] || 0) + toNumber(entry.amount);
    return acc;
  }, {});
}

function buildDepartmentSalesMap(jobList) {
  return jobList.reduce((acc, job) => {
    const dept = job.department || "Unknown";
    const sales = calculateJob(job).sales;
    acc[dept] = (acc[dept] || 0) + sales;
    return acc;
  }, {});
}

function calculateAllocatedOverhead(job, departmentSalesMap, departmentOverheadMap) {
  const dept = job.department || "Unknown";
  const jobSales = calculateJob(job).sales;
  const departmentSales = departmentSalesMap[dept] || 0;
  const departmentOverhead = departmentOverheadMap[dept] || 0;

  if (departmentSales <= 0 || departmentOverhead <= 0 || jobSales <= 0) return 0;
  return departmentOverhead * (jobSales / departmentSales);
}

function mapQuickBooksCategory(accountName) {
  const name = String(accountName || "").toLowerCase();

  if (
    name.includes("pto") ||
    name.includes("paid time off") ||
    name.includes("vacation") ||
    name.includes("sick")
  ) {
    return "Time Off / PTO";
  }
  if (
    name.includes("benefit") ||
    name.includes("insurance") ||
    name.includes("health")
  ) {
    return "Benefits";
  }
  if (
    name.includes("payroll tax") ||
    name.includes("fica") ||
    name.includes("futa") ||
    name.includes("suta")
  ) {
    return "Payroll Taxes";
  }
  if (name.includes("bonus")) {
    return "Bonuses";
  }
  if (name.includes("training") || name.includes("education")) {
    return "Training";
  }
  if (
    name.includes("donation") ||
    name.includes("contribution") ||
    name.includes("charit") ||
    name.includes("sponsor")
  ) {
    return "Donations / Sponsorships";
  }
  if (name.includes("safety")) {
    return "Safety Supplies";
  }
  if (
    name.includes("shirt") ||
    name.includes("uniform") ||
    name.includes("apparel")
  ) {
    return "Shirts / Apparel";
  }
  if (
    name.includes("computer") ||
    name.includes("pc") ||
    name.includes("laptop") ||
    name.includes("monitor") ||
    name.includes("equipment")
  ) {
    return "PCs / Equipment";
  }
  if (name.includes("office")) {
    return "Office Expenses";
  }
  if (name.includes("supplies") || name.includes("general supplies")) {
    return "General Supplies";
  }

  return "Miscellaneous Overhead";
}

function parseQuickBooksAmount(value) {
  const text = String(value || "").trim();
  if (!text) return 0;

  const negativeByParens = text.startsWith("(") && text.endsWith(")");
  const cleaned = text.replace(/[$,\(\)]/g, "").trim();
  const amount = parseFloat(cleaned);

  if (!Number.isFinite(amount)) return 0;
  return negativeByParens ? -amount : amount;
}

function parseQuickBooksPaste(rawText, department, entryDate) {
  const lines = String(rawText || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const ignoredPatterns = [
    /^total\b/i,
    /^net income\b/i,
    /^ordinary income/i,
    /^ordinary expenses/i,
    /^income\b/i,
    /^expenses\b/i,
    /^gross profit\b/i,
  ];

  const results = [];

  for (const line of lines) {
    if (ignoredPatterns.some((pattern) => pattern.test(line))) continue;

    const tabParts = line
      .split("\t")
      .map((part) => part.trim())
      .filter(Boolean);

    let accountName = "";
    let amountText = "";

    if (tabParts.length >= 2) {
      accountName = tabParts[0];
      amountText = tabParts[tabParts.length - 1];
    } else {
      const match = line.match(/^(.*?)(-?\$?\(?[\d,]+(?:\.\d{2})?\)?)$/);
      if (!match) continue;
      accountName = match[1].trim();
      amountText = match[2].trim();
    }

    if (!accountName || !amountText) continue;

    const amount = parseQuickBooksAmount(amountText);
    if (!Number.isFinite(amount) || amount === 0) continue;

    results.push({
      id: uid(),
      date: entryDate,
      department,
      category: mapQuickBooksCategory(accountName),
      subcategory: accountName,
      description: accountName,
      vendor: "",
      employeeName: "",
      amount: String(Math.abs(amount)),
      notes: "Imported from QuickBooks P&L paste",
      reviewedByManagement: false,
      recurring: false,
      createdAt: new Date().toISOString(),
    });
  }

  return results;
}

function emptyLine(type = "main", itemNumber = "") {
  return {
    id: uid(),
    type,
    itemNumber,
    description: "",
    sales: "",
    note: "",
    materials: "",
    tools: "",
    subcontractor: "",
    freightDelivery: "",
    thirdPartyJobMaterials: "",
    baggage: "",
    flightChangeExpense: "",
    seating: "",
    airfare: "",
    carRental: "",
    gas: "",
    hotel: "",
    parking: "",
    meals: "",
    deliveryPickup: "",
    toolRental: "",
    layover: "",
    regular: "",
    shiftDiff: "",
    shiftDiffOT: "",
    tmBid: "",
    travel: "",
    travelOT: "",
    mot: "",
    perDiem: "",
    drugTesting: "",
    miscOfficeExpenses: "",
    equipmentRepairs: "",
    equipmentRentals: "",
    equipmentFreight: "",
  };
}

function createBlankJob() {
  return {
    id: uid(),
    jobNumber: "",
    customer: "",
    description: "",
    department: "Installation",
    status: "Open",
    reviewedByManagement: false,
    estimatedFinalSales: "",
    estimatedFinalExpenses: "",
    percentComplete: "",
    forecastConfidence: "Medium",
    forecastNotes: "",
    lines: [emptyLine("main", "MAIN")],
    createdAt: new Date().toISOString(),
  };
}

function createBlankOverheadEntry() {
  return {
    id: uid(),
    date: "",
    department: "Installation",
    category: "",
    subcategory: "",
    description: "",
    vendor: "",
    employeeName: "",
    amount: "",
    notes: "",
    reviewedByManagement: false,
    recurring: false,
    createdAt: new Date().toISOString(),
  };
}

function calculateLine(line) {
  const sales = toNumber(line.sales);
  const totalExpenses = expenseFieldKeys.reduce(
    (sum, key) => sum + toNumber(line[key]),
    0
  );
  const profitLoss = sales - totalExpenses;
  const margin = sales > 0 ? (profitLoss / sales) * 100 : 0;

  return {
    sales,
    totalExpenses,
    profitLoss,
    margin,
  };
}

function calculateJob(job) {
  const totals = (job.lines || []).reduce(
    (acc, line) => {
      const calc = calculateLine(line);
      acc.sales += calc.sales;
      acc.totalExpenses += calc.totalExpenses;
      acc.profitLoss += calc.profitLoss;
      return acc;
    },
    { sales: 0, totalExpenses: 0, profitLoss: 0 }
  );

  return {
    ...totals,
    margin: totals.sales > 0 ? (totals.profitLoss / totals.sales) * 100 : 0,
  };
}

function calculateForecastForJob(job, departmentForecastSalesMap, departmentOverheadMap) {
  const actual = calculateJob(job);
  const estimatedFinalSales = toNumber(job.estimatedFinalSales);
  const estimatedFinalExpenses = toNumber(job.estimatedFinalExpenses);
  const isClosed = String(job.status || "").toLowerCase() === "closed";

  let forecastSales = actual.sales;
  let forecastExpenses = actual.totalExpenses;
  let source = "Actual To Date";

  if (isClosed) {
    forecastSales = actual.sales;
    forecastExpenses = actual.totalExpenses;
    source = "Closed Job Actual";
  } else if (estimatedFinalSales > 0 || estimatedFinalExpenses > 0) {
    forecastSales = estimatedFinalSales > 0 ? estimatedFinalSales : actual.sales;
    forecastExpenses =
      estimatedFinalExpenses > 0 ? estimatedFinalExpenses : actual.totalExpenses;
    source = "Forecast Estimate";
  }

  const projectedFinalGrossProfitLoss = forecastSales - forecastExpenses;
  const dept = job.department || "Unknown";
  const departmentForecastSales = departmentForecastSalesMap[dept] || 0;
  const departmentOverhead = departmentOverheadMap[dept] || 0;

  const allocatedOverhead =
    departmentForecastSales > 0 && departmentOverhead > 0 && forecastSales > 0
      ? departmentOverhead * (forecastSales / departmentForecastSales)
      : 0;

  const projectedFinalAdjustedProfitLoss =
    projectedFinalGrossProfitLoss - allocatedOverhead;

  const projectedFinalAdjustedMargin =
    forecastSales > 0 ? (projectedFinalAdjustedProfitLoss / forecastSales) * 100 : 0;

  return {
    actualSales: actual.sales,
    actualExpenses: actual.totalExpenses,
    actualGrossProfitLoss: actual.profitLoss,
    forecastSales,
    forecastExpenses,
    projectedFinalGrossProfitLoss,
    allocatedOverhead,
    projectedFinalAdjustedProfitLoss,
    projectedFinalAdjustedMargin,
    source,
  };
}

function exportJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function runSelfTests() {
  const testLine = {
    ...emptyLine("main", "MAIN"),
    sales: "1000",
    materials: "200",
    tools: "50",
    hotel: "100",
  };
  const lineCalc = calculateLine(testLine);
  console.assert(lineCalc.sales === 1000, "sales should equal 1000");
  console.assert(lineCalc.totalExpenses === 350, "expenses should equal 350");
  console.assert(lineCalc.profitLoss === 650, "profit should equal 650");
  console.assert(lineCalc.margin === 65, "margin should equal 65");

  const testJob = {
    ...createBlankJob(),
    lines: [
      { ...emptyLine("main", "MAIN"), sales: "100", materials: "40" },
      { ...emptyLine("changeOrder", "CO-1"), sales: "50", hotel: "10" },
    ],
  };
  const jobCalc = calculateJob(testJob);
  console.assert(jobCalc.sales === 150, "job sales should equal 150");
  console.assert(jobCalc.totalExpenses === 50, "job expenses should equal 50");
  console.assert(jobCalc.profitLoss === 100, "job profit should equal 100");
}

if (typeof window !== "undefined") {
  runSelfTests();
}

function Input({ label, className = "", ...props }) {
  return (
    <div>
      {label ? (
        <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-500">
          {label}
        </label>
      ) : null}
      <input
        {...props}
        className={`h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100 ${className}`}
      />
    </div>
  );
}

function Select({ label, className = "", children, ...props }) {
  return (
    <div>
      {label ? (
        <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-500">
          {label}
        </label>
      ) : null}
      <select
        {...props}
        className={`h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100 ${className}`}
      >
        {children}
      </select>
    </div>
  );
}

function Textarea({ label, className = "", ...props }) {
  return (
    <div>
      {label ? (
        <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-500">
          {label}
        </label>
      ) : null}
      <textarea
        {...props}
        className={`min-h-[110px] w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100 ${className}`}
      />
    </div>
  );
}

function Button({ children, className = "", variant = "primary", ...props }) {
  const variants = {
    primary: "bg-slate-900 text-white hover:bg-slate-800",
    secondary: "border border-slate-300 bg-white text-slate-900 hover:bg-slate-50",
    ghost: "bg-transparent text-slate-700 hover:bg-slate-100",
    danger: "bg-red-600 text-white hover:bg-red-700",
  };

  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

function StatCard({ title, value, accent = "text-slate-900", icon = null }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
          {title}
        </div>
        {icon}
      </div>
      <div className={`mt-2 text-2xl font-bold ${accent}`}>{value}</div>
    </div>
  );
}

function confidenceAccent(confidence) {
  if (confidence === "High") return "text-emerald-700";
  if (confidence === "Low") return "text-red-700";
  return "text-amber-700";
}

function JobEditorModal({ job, onClose, onSave }) {
  const [draft, setDraft] = useState(() => JSON.parse(JSON.stringify(job)));
  const [selectedLineId, setSelectedLineId] = useState(job.lines?.[0]?.id ?? null);

  useEffect(() => {
    setDraft(JSON.parse(JSON.stringify(job)));
    setSelectedLineId(job.lines?.[0]?.id ?? null);
  }, [job]);

  const selectedLine =
    draft.lines.find((line) => line.id === selectedLineId) || draft.lines[0] || null;
  const jobTotals = calculateJob(draft);

  const updateJobField = (key, value) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const updateLineField = (lineId, key, value) => {
    setDraft((prev) => ({
      ...prev,
      lines: prev.lines.map((line) =>
        line.id === lineId ? { ...line, [key]: value } : line
      ),
    }));
  };

  const addChangeOrder = () => {
    const nextNumber = `CO-${
      draft.lines.filter((line) => line.type === "changeOrder").length + 1
    }`;
    const newLine = emptyLine("changeOrder", nextNumber);
    setDraft((prev) => ({ ...prev, lines: [...prev.lines, newLine] }));
    setSelectedLineId(newLine.id);
  };

  const deleteLine = (lineId) => {
    const line = draft.lines.find((item) => item.id === lineId);
    if (!line) return;
    if (line.type === "main") {
      window.alert("The Main job line cannot be deleted.");
      return;
    }

    const nextLines = draft.lines.filter((item) => item.id !== lineId);
    setDraft((prev) => ({ ...prev, lines: nextLines }));
    setSelectedLineId(nextLines[0]?.id ?? null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/55 p-4 md:p-8">
      <div className="w-full max-w-7xl rounded-[28px] border border-slate-200 bg-slate-50 shadow-2xl">
        <div className="flex items-center justify-between rounded-t-[28px] border-b border-slate-200 bg-white px-6 py-4">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-sky-700">
              Job Workspace
            </div>
            <div className="mt-1 text-2xl font-bold text-slate-900">
              {draft.jobNumber || "New Job"}
              {draft.customer ? ` • ${draft.customer}` : ""}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => onSave(draft)}>
              <Save className="h-4 w-4" /> Save Job
            </Button>
            <Button variant="ghost" onClick={onClose}>
              <X className="h-4 w-4" /> Close
            </Button>
          </div>
        </div>

        <div className="space-y-6 p-6">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 text-lg font-bold text-slate-900">Job Header</div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Input
                label="Job #"
                value={draft.jobNumber}
                onChange={(e) => updateJobField("jobNumber", e.target.value)}
                placeholder="25-0001"
              />
              <Select
                label="Department"
                value={draft.department}
                onChange={(e) => updateJobField("department", e.target.value)}
              >
                {departmentOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Select>
              <Input
                label="Status"
                value={draft.status}
                onChange={(e) => updateJobField("status", e.target.value)}
                placeholder="Open"
              />
              <Input
                label="Customer"
                value={draft.customer}
                onChange={(e) => updateJobField("customer", e.target.value)}
                placeholder="Customer name"
              />

              <div className="flex items-end">
                <label className="flex w-full items-center gap-3 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-900">
                  <input
                    type="checkbox"
                    checked={!!draft.reviewedByManagement}
                    onChange={(e) =>
                      updateJobField("reviewedByManagement", e.target.checked)
                    }
                    className="h-4 w-4"
                  />
                  Reviewed by Management
                </label>
              </div>

              <Textarea
                label="Job Description"
                value={draft.description}
                onChange={(e) => updateJobField("description", e.target.value)}
                placeholder="Main job description"
                className="md:col-span-2 lg:col-span-4"
              />
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div className="text-lg font-bold text-slate-900">
                Main Job + Change Orders
              </div>
              <Button onClick={addChangeOrder}>
                <Plus className="h-4 w-4" /> Add Change Order
              </Button>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-100 text-slate-700">
                  <tr>
                    <th className="px-4 py-3 text-left font-bold">Type</th>
                    <th className="px-4 py-3 text-left font-bold">Number</th>
                    <th className="px-4 py-3 text-left font-bold">Description</th>
                    <th className="px-4 py-3 text-right font-bold">Sales</th>
                    <th className="px-4 py-3 text-right font-bold">Expenses</th>
                    <th className="px-4 py-3 text-right font-bold">P&amp;L</th>
                    <th className="px-4 py-3 text-right font-bold">Margin</th>
                    <th className="px-4 py-3 text-center font-bold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {draft.lines.map((line) => {
                    const calc = calculateLine(line);
                    const active = selectedLineId === line.id;

                    return (
                      <tr
                        key={line.id}
                        className={`cursor-pointer border-t border-slate-200 ${
                          active ? "bg-sky-50" : "bg-white hover:bg-slate-50"
                        }`}
                        onClick={() => setSelectedLineId(line.id)}
                      >
                        <td className="px-4 py-3 font-semibold text-slate-700">
                          {line.type === "main" ? "Main Job" : "Change Order"}
                        </td>
                        <td className="px-4 py-3">{line.itemNumber || "-"}</td>
                        <td className="max-w-[280px] truncate px-4 py-3">
                          {line.description || "—"}
                        </td>
                        <td className="px-4 py-3 text-right">{formatCurrency(calc.sales)}</td>
                        <td className="px-4 py-3 text-right">
                          {formatCurrency(calc.totalExpenses)}
                        </td>
                        <td
                          className={`px-4 py-3 text-right font-semibold ${
                            calc.profitLoss >= 0 ? "text-emerald-600" : "text-red-600"
                          }`}
                        >
                          {formatCurrency(calc.profitLoss)}
                        </td>
                        <td
                          className={`px-4 py-3 text-right font-semibold ${
                            calc.margin >= 0 ? "text-emerald-600" : "text-red-600"
                          }`}
                        >
                          {formatPercent(calc.margin)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {line.type === "changeOrder" ? (
                            <button
                              className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-600"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteLine(line.id);
                              }}
                              type="button"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          ) : (
                            <span className="text-xs text-slate-400">Locked</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard title="Job Sales" value={formatCurrency(jobTotals.sales)} />
            <StatCard title="Job Expenses" value={formatCurrency(jobTotals.totalExpenses)} />
            <StatCard
              title="Job Profit / Loss"
              value={formatCurrency(jobTotals.profitLoss)}
              accent={jobTotals.profitLoss >= 0 ? "text-emerald-600" : "text-red-600"}
            />
            <StatCard
              title="Job Margin"
              value={formatPercent(jobTotals.margin)}
              accent={jobTotals.margin >= 0 ? "text-emerald-600" : "text-red-600"}
            />
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 text-lg font-bold text-slate-900">
              Forecast / Year-End Projection
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Input
                label="Estimated Final Sales"
                type="number"
                step="0.01"
                value={draft.estimatedFinalSales ?? ""}
                onChange={(e) => updateJobField("estimatedFinalSales", e.target.value)}
                placeholder="0.00"
              />
              <Input
                label="Estimated Final Expenses"
                type="number"
                step="0.01"
                value={draft.estimatedFinalExpenses ?? ""}
                onChange={(e) => updateJobField("estimatedFinalExpenses", e.target.value)}
                placeholder="0.00"
              />
              <Input
                label="Percent Complete"
                type="number"
                step="0.01"
                value={draft.percentComplete ?? ""}
                onChange={(e) => updateJobField("percentComplete", e.target.value)}
                placeholder="0"
              />
              <Select
                label="Forecast Confidence"
                value={draft.forecastConfidence || "Medium"}
                onChange={(e) => updateJobField("forecastConfidence", e.target.value)}
              >
                {forecastConfidenceOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Select>

              <Textarea
                label="Forecast Notes"
                value={draft.forecastNotes ?? ""}
                onChange={(e) => updateJobField("forecastNotes", e.target.value)}
                placeholder="Explain why the job should end above or below current numbers"
                className="md:col-span-2 lg:col-span-4"
              />
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            {selectedLine ? (
              <>
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-sky-700">
                      {selectedLine.type === "main" ? "Main Job Detail" : "Change Order Detail"}
                    </div>
                    <div className="mt-1 text-2xl font-bold text-slate-900">
                      {selectedLine.itemNumber || "Detail"}
                    </div>
                  </div>
                  <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">
                    {formatCurrency(calculateLine(selectedLine).profitLoss)}
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <Input
                    label="Type"
                    value={selectedLine.type === "main" ? "Main Job" : "Change Order"}
                    disabled
                  />
                  <Input
                    label="Main Job / CO #"
                    value={selectedLine.itemNumber}
                    onChange={(e) =>
                      updateLineField(selectedLine.id, "itemNumber", e.target.value)
                    }
                    placeholder="MAIN or CO-1"
                    disabled={selectedLine.type === "main"}
                  />
                  <Input
                    label="Sales"
                    type="number"
                    step="0.01"
                    value={selectedLine.sales}
                    onChange={(e) => updateLineField(selectedLine.id, "sales", e.target.value)}
                    placeholder="0.00"
                  />
                  <div />
                  <Textarea
                    label="Description"
                    value={selectedLine.description}
                    onChange={(e) =>
                      updateLineField(selectedLine.id, "description", e.target.value)
                    }
                    placeholder="Describe the main job or change order"
                    className="md:col-span-2 lg:col-span-4"
                  />
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <StatCard
                    title="Total Materials"
                    value={formatCurrency(toNumber(selectedLine.materials))}
                  />
                  <StatCard
                    title="Total Freight & Delivery"
                    value={formatCurrency(toNumber(selectedLine.freightDelivery))}
                  />
                  <StatCard
                    title="Materials + Freight Total"
                    value={formatCurrency(
                      toNumber(selectedLine.materials) +
                        toNumber(selectedLine.freightDelivery)
                    )}
                    accent="text-slate-900"
                  />
                  <StatCard
                    title="Freight as % of Materials"
                    value={formatPercent(
                      freightPercentOfMaterials(
                        selectedLine.freightDelivery,
                        selectedLine.materials
                      )
                    )}
                    accent="text-amber-600"
                  />
                </div>

                {expenseGroups.map((group) => (
                  <div
                    key={group.title}
                    className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4"
                  >
                    <div className="mb-3 text-base font-bold text-slate-900">
                      {group.title}
                    </div>
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                      {group.fields.map(([key, label]) => (
                        <Input
                          key={key}
                          label={label}
                          type="number"
                          step="0.01"
                          value={selectedLine[key]}
                          onChange={(e) =>
                            updateLineField(selectedLine.id, key, e.target.value)
                          }
                          placeholder="0.00"
                        />
                      ))}
                    </div>
                  </div>
                ))}

                <div className="mt-6">
                  <Textarea
                    label="Note"
                    value={selectedLine.note}
                    onChange={(e) => updateLineField(selectedLine.id, "note", e.target.value)}
                    placeholder="Add notes for this job line or change order"
                  />
                </div>
              </>
            ) : (
              <div className="text-slate-500">Select a job line to edit.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function OverheadEntryModal({ entry, onClose, onSave }) {
  const [draft, setDraft] = useState(() => JSON.parse(JSON.stringify(entry)));

  useEffect(() => {
    setDraft(JSON.parse(JSON.stringify(entry)));
  }, [entry]);

  const updateField = (key, value) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/55 p-4 md:p-8">
      <div className="w-full max-w-5xl rounded-[28px] border border-slate-200 bg-slate-50 shadow-2xl">
        <div className="flex items-center justify-between rounded-t-[28px] border-b border-slate-200 bg-white px-6 py-4">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-sky-700">
              Overhead Workspace
            </div>
            <div className="mt-1 text-2xl font-bold text-slate-900">
              {draft.description || "New Overhead Entry"}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => onSave(draft)}>
              <Save className="h-4 w-4" /> Save Entry
            </Button>
            <Button variant="ghost" onClick={onClose}>
              <X className="h-4 w-4" /> Close
            </Button>
          </div>
        </div>

        <div className="space-y-6 p-6">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 text-lg font-bold text-slate-900">Overhead Entry</div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Input
                label="Date"
                type="date"
                value={draft.date}
                onChange={(e) => updateField("date", e.target.value)}
              />
              <Select
                label="Department"
                value={draft.department}
                onChange={(e) => updateField("department", e.target.value)}
              >
                {departmentOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Select>
              <Select
                label="Category"
                value={draft.category}
                onChange={(e) => updateField("category", e.target.value)}
              >
                <option value="">Select Category</option>
                {overheadCategoryOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Select>
              <Input
                label="Amount"
                type="number"
                step="0.01"
                value={draft.amount}
                onChange={(e) => updateField("amount", e.target.value)}
                placeholder="0.00"
              />

              <Input
                label="Subcategory"
                value={draft.subcategory}
                onChange={(e) => updateField("subcategory", e.target.value)}
                placeholder="Health Insurance, Shirts, Laptop..."
              />
              <Input
                label="Vendor"
                value={draft.vendor}
                onChange={(e) => updateField("vendor", e.target.value)}
                placeholder="Vendor name"
              />
              <Input
                label="Employee Name"
                value={draft.employeeName}
                onChange={(e) => updateField("employeeName", e.target.value)}
                placeholder="Employee name"
              />
              <div className="flex items-end">
                <label className="flex w-full items-center gap-3 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-900">
                  <input
                    type="checkbox"
                    checked={!!draft.reviewedByManagement}
                    onChange={(e) =>
                      updateField("reviewedByManagement", e.target.checked)
                    }
                    className="h-4 w-4"
                  />
                  Reviewed by Management
                </label>
              </div>

              <div className="flex items-end">
                <label className="flex w-full items-center gap-3 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-900">
                  <input
                    type="checkbox"
                    checked={!!draft.recurring}
                    onChange={(e) => updateField("recurring", e.target.checked)}
                    className="h-4 w-4"
                  />
                  Recurring
                </label>
              </div>

              <Textarea
                label="Description"
                value={draft.description}
                onChange={(e) => updateField("description", e.target.value)}
                placeholder="Explain this overhead item"
                className="md:col-span-2 lg:col-span-3"
              />
              <Textarea
                label="Notes"
                value={draft.notes}
                onChange={(e) => updateField("notes", e.target.value)}
                placeholder="Additional notes"
                className="md:col-span-2 lg:col-span-4"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard title="Amount" value={formatCurrency(draft.amount)} />
            <StatCard title="Department" value={draft.department || "—"} />
            <StatCard title="Category" value={draft.category || "—"} />
            <StatCard
              title="Reviewed"
              value={draft.reviewedByManagement ? "Yes" : "No"}
              accent={draft.reviewedByManagement ? "text-emerald-600" : "text-slate-900"}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [jobs, setJobs] = useState([]);
  const [overheadEntries, setOverheadEntries] = useState([]);

  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("All Departments");

  const [overheadSearch, setOverheadSearch] = useState("");
  const [overheadDepartmentFilter, setOverheadDepartmentFilter] =
    useState("All Departments");
  const [overheadCategoryFilter, setOverheadCategoryFilter] =
    useState("All Categories");
  const [overheadMonthFilter, setOverheadMonthFilter] = useState("All Months");
  const [overheadYearFilter, setOverheadYearFilter] =
    useState(String(new Date().getFullYear()));

  const [forecastSearch, setForecastSearch] = useState("");
  const [forecastStatusFilter, setForecastStatusFilter] = useState("All Statuses");
  const [forecastConfidenceFilter, setForecastConfidenceFilter] =
    useState("All Confidence");

  const [showQbPasteModal, setShowQbPasteModal] = useState(false);
  const [qbPasteText, setQbPasteText] = useState("");
  const [qbPasteDepartment, setQbPasteDepartment] = useState("Installation");
  const [qbPasteDate, setQbPasteDate] = useState(
    new Date().toISOString().slice(0, 10)
  );

  const [activeTab, setActiveTab] = useState("jobs");
  const [editingJobId, setEditingJobId] = useState(null);
  const [editingOverheadId, setEditingOverheadId] = useState(null);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setJobs(parsed);
          return;
        }
      } catch (error) {
        console.error("Failed to load jobs", error);
      }
    }

    const starterJob = createBlankJob();
    setJobs([starterJob]);
    setEditingJobId(starterJob.id);
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
  }, [jobs]);

  useEffect(() => {
    const raw = localStorage.getItem(OVERHEAD_STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setOverheadEntries(parsed);
        }
      } catch (error) {
        console.error("Failed to load overhead entries", error);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(OVERHEAD_STORAGE_KEY, JSON.stringify(overheadEntries));
  }, [overheadEntries]);

  const filteredJobs = useMemo(() => {
    const term = search.toLowerCase().trim();
    return jobs.filter((job) => {
      const matchesSearch =
        term === "" ||
        [job.jobNumber, job.customer, job.description, job.status, job.department]
          .some((value) => String(value || "").toLowerCase().includes(term));

      const matchesDepartment =
        departmentFilter === "All Departments" ||
        (job.department || "") === departmentFilter;

      return matchesSearch && matchesDepartment;
    });
  }, [jobs, search, departmentFilter]);

  const filteredOverheadEntries = useMemo(() => {
    return overheadEntries.filter((entry) => {
      const matchesDepartment =
        overheadDepartmentFilter === "All Departments" ||
        entry.department === overheadDepartmentFilter;

      const matchesCategory =
        overheadCategoryFilter === "All Categories" ||
        entry.category === overheadCategoryFilter;

      const entryDate = entry.date ? new Date(entry.date) : null;
      const entryMonth =
        entryDate && !Number.isNaN(entryDate.getTime())
          ? String(entryDate.getMonth() + 1).padStart(2, "0")
          : "";
      const entryYear =
        entryDate && !Number.isNaN(entryDate.getTime())
          ? String(entryDate.getFullYear())
          : "";

      const matchesMonth =
        overheadMonthFilter === "All Months" || entryMonth === overheadMonthFilter;

      const matchesYear =
        overheadYearFilter === "All Years" || entryYear === overheadYearFilter;

      const term = overheadSearch.toLowerCase().trim();
      const matchesSearch =
        term === "" ||
        [
          entry.description,
          entry.subcategory,
          entry.vendor,
          entry.employeeName,
          entry.notes,
          entry.category,
          entry.department,
        ].some((value) => String(value || "").toLowerCase().includes(term));

      return (
        matchesDepartment &&
        matchesCategory &&
        matchesMonth &&
        matchesYear &&
        matchesSearch
      );
    });
  }, [
    overheadEntries,
    overheadDepartmentFilter,
    overheadCategoryFilter,
    overheadMonthFilter,
    overheadYearFilter,
    overheadSearch,
  ]);

  const overallTotals = useMemo(() => totalsForJobs(jobs), [jobs]);
  const filteredTotals = useMemo(() => totalsForJobs(filteredJobs), [filteredJobs]);

  const overheadTotals = useMemo(
    () => totalsForOverhead(filteredOverheadEntries),
    [filteredOverheadEntries]
  );

  const departmentOverheadSummary = useMemo(
    () => overheadByDepartment(filteredOverheadEntries),
    [filteredOverheadEntries]
  );

  const overallMargin =
    overallTotals.sales > 0 ? (overallTotals.profitLoss / overallTotals.sales) * 100 : 0;

  const filteredMargin =
    filteredTotals.sales > 0 ? (filteredTotals.profitLoss / filteredTotals.sales) * 100 : 0;

  const overallFreightPct = freightPercentOfMaterials(
    overallTotals.freightDelivery,
    overallTotals.materials
  );

  const filteredFreightPct = freightPercentOfMaterials(
    filteredTotals.freightDelivery,
    filteredTotals.materials
  );

  const reportOverheadEntries = useMemo(() => {
    return overheadEntries.filter((entry) => {
      return (
        departmentFilter === "All Departments" ||
        entry.department === departmentFilter
      );
    });
  }, [overheadEntries, departmentFilter]);

  const reportOverheadTotals = useMemo(
    () => totalsForOverhead(reportOverheadEntries),
    [reportOverheadEntries]
  );

  const reportDepartmentOverheadMap = useMemo(
    () => buildDepartmentOverheadMap(reportOverheadEntries),
    [reportOverheadEntries]
  );

  const reportDepartmentSalesMap = useMemo(
    () => buildDepartmentSalesMap(filteredJobs),
    [filteredJobs]
  );

  const adjustedReportRows = useMemo(() => {
    return filteredJobs.map((job) => {
      const calc = calculateJob(job);
      const allocatedOverhead = calculateAllocatedOverhead(
        job,
        reportDepartmentSalesMap,
        reportDepartmentOverheadMap
      );
      const adjustedProfitLoss = calc.profitLoss - allocatedOverhead;
      const adjustedMargin = calc.sales > 0 ? (adjustedProfitLoss / calc.sales) * 100 : 0;

      return {
        job,
        calc,
        allocatedOverhead,
        adjustedProfitLoss,
        adjustedMargin,
      };
    });
  }, [filteredJobs, reportDepartmentSalesMap, reportDepartmentOverheadMap]);

  const adjustedReportTotals = useMemo(() => {
    const grossProfitLoss = filteredTotals.profitLoss;
    const totalOverhead = reportOverheadTotals.total;
    const adjustedProfitLoss = grossProfitLoss - totalOverhead;
    const adjustedMargin =
      filteredTotals.sales > 0 ? (adjustedProfitLoss / filteredTotals.sales) * 100 : 0;

    return {
      grossProfitLoss,
      totalOverhead,
      adjustedProfitLoss,
      adjustedMargin,
    };
  }, [filteredTotals, reportOverheadTotals]);

  const departmentContributionRows = useMemo(() => {
    return departmentOptions
      .map((department) => {
        const departmentJobs = filteredJobs.filter((job) => job.department === department);
        const departmentJobTotals = totalsForJobs(departmentJobs);
        const departmentOverhead = reportDepartmentOverheadMap[department] || 0;
        const adjustedContribution = departmentJobTotals.profitLoss - departmentOverhead;

        return {
          department,
          sales: departmentJobTotals.sales,
          expenses: departmentJobTotals.totalExpenses,
          grossProfitLoss: departmentJobTotals.profitLoss,
          overhead: departmentOverhead,
          adjustedContribution,
        };
      })
      .filter(
        (row) =>
          row.sales !== 0 ||
          row.expenses !== 0 ||
          row.grossProfitLoss !== 0 ||
          row.overhead !== 0
      );
  }, [filteredJobs, reportDepartmentOverheadMap]);

  const forecastOverheadEntries = useMemo(() => {
    return overheadEntries.filter((entry) => {
      return (
        departmentFilter === "All Departments" ||
        entry.department === departmentFilter
      );
    });
  }, [overheadEntries, departmentFilter]);

  const forecastDepartmentOverheadMap = useMemo(
    () => buildDepartmentOverheadMap(forecastOverheadEntries),
    [forecastOverheadEntries]
  );

  const forecastBaseJobs = useMemo(() => {
    return filteredJobs.filter((job) => {
      const statusMatches =
        forecastStatusFilter === "All Statuses" ||
        String(job.status || "").toLowerCase() === forecastStatusFilter.toLowerCase();

      const confidenceMatches =
        forecastConfidenceFilter === "All Confidence" ||
        (job.forecastConfidence || "Medium") === forecastConfidenceFilter;

      const term = forecastSearch.toLowerCase().trim();
      const searchMatches =
        term === "" ||
        [
          job.jobNumber,
          job.customer,
          job.description,
          job.department,
          job.status,
          job.forecastNotes,
          job.forecastConfidence,
        ].some((value) => String(value || "").toLowerCase().includes(term));

      return statusMatches && confidenceMatches && searchMatches;
    });
  }, [filteredJobs, forecastStatusFilter, forecastConfidenceFilter, forecastSearch]);

  const forecastDepartmentSalesMap = useMemo(() => {
    return forecastBaseJobs.reduce((acc, job) => {
      const forecastSales = (() => {
        const actual = calculateJob(job).sales;
        const isClosed = String(job.status || "").toLowerCase() === "closed";
        const estimatedFinalSales = toNumber(job.estimatedFinalSales);
        if (isClosed) return actual;
        return estimatedFinalSales > 0 ? estimatedFinalSales : actual;
      })();

      const dept = job.department || "Unknown";
      acc[dept] = (acc[dept] || 0) + forecastSales;
      return acc;
    }, {});
  }, [forecastBaseJobs]);

  const forecastRows = useMemo(() => {
    return forecastBaseJobs.map((job) => {
      const forecast = calculateForecastForJob(
        job,
        forecastDepartmentSalesMap,
        forecastDepartmentOverheadMap
      );

      return {
        job,
        ...forecast,
      };
    });
  }, [forecastBaseJobs, forecastDepartmentSalesMap, forecastDepartmentOverheadMap]);

  const forecastTotals = useMemo(() => {
    return forecastRows.reduce(
      (acc, row) => {
        const isClosed = String(row.job.status || "").toLowerCase() === "closed";
        if (isClosed) {
          acc.closedActualProfitLoss += row.actualGrossProfitLoss;
        } else {
          acc.openProjectedProfitLoss += row.projectedFinalGrossProfitLoss;
        }

        acc.projectedGrossProfitLoss += row.projectedFinalGrossProfitLoss;
        acc.projectedOverhead += row.allocatedOverhead;
        acc.projectedYearEndProfitLoss += row.projectedFinalAdjustedProfitLoss;
        acc.projectedSales += row.forecastSales;

        return acc;
      },
      {
        closedActualProfitLoss: 0,
        openProjectedProfitLoss: 0,
        projectedGrossProfitLoss: 0,
        projectedOverhead: 0,
        projectedYearEndProfitLoss: 0,
        projectedSales: 0,
      }
    );
  }, [forecastRows]);

  const projectedYearEndMargin =
    forecastTotals.projectedSales > 0
      ? (forecastTotals.projectedYearEndProfitLoss / forecastTotals.projectedSales) * 100
      : 0;

  const forecastDepartmentRows = useMemo(() => {
    return departmentOptions
      .map((department) => {
        const departmentRows = forecastRows.filter((row) => row.job.department === department);

        const totals = departmentRows.reduce(
          (acc, row) => {
            const isClosed = String(row.job.status || "").toLowerCase() === "closed";
            if (isClosed) {
              acc.closedActualProfitLoss += row.actualGrossProfitLoss;
            } else {
              acc.openProjectedProfitLoss += row.projectedFinalGrossProfitLoss;
            }

            acc.projectedGrossProfitLoss += row.projectedFinalGrossProfitLoss;
            acc.projectedOverhead += row.allocatedOverhead;
            acc.projectedAdjustedContribution += row.projectedFinalAdjustedProfitLoss;

            return acc;
          },
          {
            closedActualProfitLoss: 0,
            openProjectedProfitLoss: 0,
            projectedGrossProfitLoss: 0,
            projectedOverhead: 0,
            projectedAdjustedContribution: 0,
          }
        );

        return {
          department,
          ...totals,
        };
      })
      .filter(
        (row) =>
          row.closedActualProfitLoss !== 0 ||
          row.openProjectedProfitLoss !== 0 ||
          row.projectedGrossProfitLoss !== 0 ||
          row.projectedOverhead !== 0 ||
          row.projectedAdjustedContribution !== 0
      );
  }, [forecastRows]);

  const qbPastePreviewRows = useMemo(() => {
    return parseQuickBooksPaste(qbPasteText, qbPasteDepartment, qbPasteDate);
  }, [qbPasteText, qbPasteDepartment, qbPasteDate]);

  const activeJob = jobs.find((job) => job.id === editingJobId) || null;
  const activeOverheadEntry =
    overheadEntries.find((entry) => entry.id === editingOverheadId) || null;

  const createJob = () => {
    const newJob = createBlankJob();
    setJobs((prev) => [newJob, ...prev]);
    setEditingJobId(newJob.id);
  };

  const saveJob = (updatedJob) => {
    setJobs((prev) => prev.map((job) => (job.id === updatedJob.id ? updatedJob : job)));
    setEditingJobId(null);
  };

  const deleteJob = (jobId) => {
    if (!window.confirm("Delete this job?")) return;

    setJobs((prev) => {
      const nextJobs = prev.filter((job) => job.id !== jobId);
      if (nextJobs.length === 0) {
        const starterJob = createBlankJob();
        setEditingJobId(starterJob.id);
        return [starterJob];
      }
      if (editingJobId === jobId) {
        setEditingJobId(null);
      }
      return nextJobs;
    });
  };

  const createOverheadEntry = () => {
    const newEntry = createBlankOverheadEntry();
    setOverheadEntries((prev) => [newEntry, ...prev]);
    setEditingOverheadId(newEntry.id);
  };

  const saveOverheadEntry = (updatedEntry) => {
    setOverheadEntries((prev) =>
      prev.map((entry) => (entry.id === updatedEntry.id ? updatedEntry : entry))
    );
    setEditingOverheadId(null);
  };

  const deleteOverheadEntry = (entryId) => {
    if (!window.confirm("Delete this overhead entry?")) return;
    setOverheadEntries((prev) => prev.filter((entry) => entry.id !== entryId));
  };

  const importQuickBooksPaste = () => {
    const rows = parseQuickBooksPaste(qbPasteText, qbPasteDepartment, qbPasteDate);

    if (!rows.length) {
      window.alert("No QuickBooks lines were recognized from the pasted report.");
      return;
    }

    setOverheadEntries((prev) => [...rows, ...prev]);
    setQbPasteText("");
    setShowQbPasteModal(false);
    setActiveTab("overhead");
  };

  const exportAll = () => {
    exportJson("profit-loss-jobs.json", jobs);
  };

  const printReport = () => {
    setActiveTab("reports");
    setTimeout(() => {
      window.print();
    }, 150);
  };

  const printOverheadReport = () => {
    setActiveTab("overhead");
    setTimeout(() => {
      window.print();
    }, 150);
  };

  const printForecastReport = () => {
    setActiveTab("forecast");
    setTimeout(() => {
      window.print();
    }, 150);
  };

  const exportReport = () => {
    const report = adjustedReportRows.map((row) => ({
      jobNumber: row.job.jobNumber,
      customer: row.job.customer,
      description: row.job.description,
      department: row.job.department,
      status: row.job.status,
      reviewedByManagement: !!row.job.reviewedByManagement,
      sales: row.calc.sales,
      totalExpenses: row.calc.totalExpenses,
      grossProfitLoss: row.calc.profitLoss,
      allocatedOverhead: row.allocatedOverhead,
      adjustedProfitLoss: row.adjustedProfitLoss,
      adjustedMargin: Number(row.adjustedMargin.toFixed(2)),
      lineCount: row.job.lines.length,
    }));

    exportJson("profit-loss-report.json", report);
  };

  const exportOverheadReport = () => {
    exportJson("overhead-report.json", filteredOverheadEntries);
  };

  const exportForecastReport = () => {
    const report = forecastRows.map((row) => ({
      jobNumber: row.job.jobNumber,
      customer: row.job.customer,
      department: row.job.department,
      status: row.job.status,
      reviewedByManagement: !!row.job.reviewedByManagement,
      actualSales: row.actualSales,
      actualExpenses: row.actualExpenses,
      actualGrossProfitLoss: row.actualGrossProfitLoss,
      estimatedFinalSales: toNumber(row.job.estimatedFinalSales),
      estimatedFinalExpenses: toNumber(row.job.estimatedFinalExpenses),
      projectedFinalGrossProfitLoss: row.projectedFinalGrossProfitLoss,
      allocatedOverhead: row.allocatedOverhead,
      projectedFinalAdjustedProfitLoss: row.projectedFinalAdjustedProfitLoss,
      projectedFinalAdjustedMargin: Number(row.projectedFinalAdjustedMargin.toFixed(2)),
      percentComplete: row.job.percentComplete,
      forecastConfidence: row.job.forecastConfidence || "Medium",
      forecastNotes: row.job.forecastNotes || "",
      source: row.source,
    }));

    exportJson("forecast-report.json", report);
  };

  const reportTitle =
    departmentFilter === "All Departments"
      ? "Profitability Report"
      : `${departmentFilter} Profitability Report`;

  const overheadReportTitle =
    overheadDepartmentFilter === "All Departments"
      ? "Department Overhead Report"
      : `${overheadDepartmentFilter} Overhead Report`;

  const forecastReportTitle =
    departmentFilter === "All Departments"
      ? "Year-End Forecast Report"
      : `${departmentFilter} Year-End Forecast Report`;

  const printedOn = new Date().toLocaleString();

  return (
    <div className="min-h-screen bg-slate-100">
      <style>{`
        .print-only {
          display: none;
        }

        @media print {
          body {
            background: #ffffff !important;
          }

          .no-print {
            display: none !important;
          }

          .print-only {
            display: block !important;
          }

          .print-page {
            padding: 0 !important;
            margin: 0 !important;
          }

          .report-print-header {
            display: block !important;
            margin: 0 0 18px 0;
            padding: 0 0 14px 0;
            border-bottom: 2px solid #cbd5e1;
            background: #ffffff;
          }

          .report-print-company {
            font-size: 13px;
            font-weight: 700;
            letter-spacing: 0.18em;
            text-transform: uppercase;
            color: #334155;
            margin-bottom: 8px;
          }

          .report-print-title {
            font-size: 28px;
            font-weight: 700;
            color: #0f172a;
            margin-bottom: 6px;
            line-height: 1.2;
          }

          .report-print-subtitle {
            font-size: 12px;
            color: #475569;
            margin-bottom: 14px;
          }

          .report-print-meta {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 12px;
            margin-top: 10px;
          }

          .report-print-meta-item {
            padding: 0;
            border: none;
            background: transparent;
          }

          .report-print-label {
            font-size: 10px;
            font-weight: 700;
            letter-spacing: 0.12em;
            text-transform: uppercase;
            color: #64748b;
            margin-bottom: 3px;
          }

          .report-print-value {
            font-size: 15px;
            font-weight: 700;
            color: #0f172a;
          }

          table {
            width: 100% !important;
            border-collapse: collapse !important;
          }

          th, td {
            border: 1px solid #d1d5db !important;
            padding: 8px !important;
            font-size: 12px !important;
          }

          thead {
            display: table-header-group !important;
          }

          tr {
            page-break-inside: avoid !important;
          }
        }
      `}</style>

      <div className="border-b border-slate-200 bg-white no-print">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 md:flex-row md:items-center md:justify-between md:px-8">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-sky-700">
              Northeast Data
            </div>
            <div className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
              Profit &amp; Loss Job Costing
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant={activeTab === "jobs" ? "primary" : "secondary"}
              onClick={() => setActiveTab("jobs")}
            >
              <Briefcase className="h-4 w-4" /> Jobs
            </Button>
            <Button
              variant={activeTab === "reports" ? "primary" : "secondary"}
              onClick={() => setActiveTab("reports")}
            >
              <BarChart3 className="h-4 w-4" /> Reports
            </Button>
            <Button
              variant={activeTab === "overhead" ? "primary" : "secondary"}
              onClick={() => setActiveTab("overhead")}
            >
              <FileText className="h-4 w-4" /> Overhead
            </Button>
            <Button
              variant={activeTab === "forecast" ? "primary" : "secondary"}
              onClick={() => setActiveTab("forecast")}
            >
              <BarChart3 className="h-4 w-4" /> Forecast
            </Button>
            <Button variant="secondary" onClick={exportAll}>
              <FileText className="h-4 w-4" /> Export Jobs
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[2200px] space-y-6 p-4 md:p-8 print-page">
        <div className="rounded-[28px] bg-gradient-to-r from-slate-950 via-slate-900 to-sky-900 p-6 text-white shadow-[0_18px_50px_rgba(15,23,42,0.22)] md:p-8 no-print">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-sm font-bold uppercase tracking-[0.24em] text-sky-200">
                {activeTab === "overhead"
                  ? "Department Overhead Tracking"
                  : activeTab === "reports"
                  ? "Adjusted Profitability Reporting"
                  : activeTab === "forecast"
                  ? "Year-End Forecasting"
                  : "Job + Change Order Tracking"}
              </div>
              <h1 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">
                {activeTab === "overhead"
                  ? "Non-Billable Department Costs and Overhead Reporting"
                  : activeTab === "reports"
                  ? "Gross vs Adjusted Profitability After Overhead"
                  : activeTab === "forecast"
                  ? "Projected Year-End Profit / Loss and Margin Forecast"
                  : "Main Job P&L and Change Order P&L in One App"}
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-200 md:text-base">
                {activeTab === "overhead"
                  ? "Track time off, benefits, donations, safety supplies, shirts, PCs, office purchases, and other non-billable costs by department."
                  : activeTab === "reports"
                  ? "Show management how overhead changes each job, each department, and the overall bottom line."
                  : activeTab === "forecast"
                  ? "Estimate where the year ends if current jobs finish as expected, with forecasted gross and adjusted profitability."
                  : "Create a parent job, add change orders under the same job, track separate profitability for each line, and view rolled-up totals for the full project."}
              </p>
            </div>
            <div className="flex gap-2">
              {activeTab === "overhead" ? (
                <>
                  <Button variant="secondary" onClick={createOverheadEntry}>
                    <Plus className="h-4 w-4" /> New Overhead Entry
                  </Button>
                  <Button variant="secondary" onClick={() => setShowQbPasteModal(true)}>
                    Paste QuickBooks P&amp;L
                  </Button>
                  <Button variant="secondary" onClick={printOverheadReport}>
                    Print Overhead Report
                  </Button>
                  <Button
                    className="bg-white text-slate-900 hover:bg-slate-200"
                    onClick={exportOverheadReport}
                  >
                    <Save className="h-4 w-4" /> Export Overhead
                  </Button>
                </>
              ) : activeTab === "forecast" ? (
                <>
                  <Button variant="secondary" onClick={printForecastReport}>
                    Print Forecast
                  </Button>
                  <Button
                    className="bg-white text-slate-900 hover:bg-slate-200"
                    onClick={exportForecastReport}
                  >
                    <Save className="h-4 w-4" /> Export Forecast
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="secondary" onClick={createJob}>
                    <Plus className="h-4 w-4" /> New Job
                  </Button>
                  <Button variant="secondary" onClick={printReport}>
                    Print Report
                  </Button>
                  <Button
                    className="bg-white text-slate-900 hover:bg-slate-200"
                    onClick={exportReport}
                  >
                    <Save className="h-4 w-4" /> Export Report
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>

        {activeTab === "jobs" ? (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <StatCard
                title={
                  departmentFilter === "All Departments"
                    ? "Total Sales"
                    : `${departmentFilter} Sales`
                }
                value={formatCurrency(filteredTotals.sales)}
              />
              <StatCard
                title={
                  departmentFilter === "All Departments"
                    ? "Total Expenses"
                    : `${departmentFilter} Expenses`
                }
                value={formatCurrency(filteredTotals.totalExpenses)}
              />
              <StatCard
                title={
                  departmentFilter === "All Departments"
                    ? "Total Profit / Loss"
                    : `${departmentFilter} Profit / Loss`
                }
                value={formatCurrency(filteredTotals.profitLoss)}
                accent={filteredTotals.profitLoss >= 0 ? "text-emerald-600" : "text-red-600"}
              />
              <StatCard
                title={
                  departmentFilter === "All Departments"
                    ? "Total Margin %"
                    : `${departmentFilter} Margin %`
                }
                value={formatPercent(filteredMargin)}
                accent={filteredMargin >= 0 ? "text-emerald-600" : "text-red-600"}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <StatCard
                title={
                  departmentFilter === "All Departments"
                    ? "Total Materials"
                    : `${departmentFilter} Materials`
                }
                value={formatCurrency(filteredTotals.materials)}
              />
              <StatCard
                title={
                  departmentFilter === "All Departments"
                    ? "Total Freight"
                    : `${departmentFilter} Freight`
                }
                value={formatCurrency(filteredTotals.freightDelivery)}
              />
              <StatCard
                title={
                  departmentFilter === "All Departments"
                    ? "Total Freight % of Materials"
                    : `${departmentFilter} Freight % of Materials`
                }
                value={formatPercent(filteredFreightPct)}
                accent="text-amber-600"
              />
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="text-xl font-bold text-slate-900">Job List</div>
                  <div className="mt-1 text-sm text-slate-500">
                    Open a job to manage the main contract and all change orders.
                  </div>
                </div>
                <div className="flex w-full flex-col gap-3 lg:w-auto lg:flex-row lg:items-center">
                  <div className="min-w-[220px]">
                    <Select value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)}>
                      <option value="All Departments">All Departments</option>
                      {departmentOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="relative w-full lg:w-[360px]">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search jobs, customer, description..."
                      className="h-11 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3 text-sm outline-none focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-200">
                <table className="min-w-[1700px] text-sm">
                  <thead className="bg-slate-100 text-slate-700">
                    <tr>
                      <th className="px-4 py-3 text-left font-bold">Job #</th>
                      <th className="px-4 py-3 text-left font-bold">Customer</th>
                      <th className="px-4 py-3 text-left font-bold">Description</th>
                      <th className="px-4 py-3 text-left font-bold">Department</th>
                      <th className="px-4 py-3 text-left font-bold">Status</th>
                      <th className="px-4 py-3 text-center font-bold">Reviewed</th>
                      <th className="px-4 py-3 text-right font-bold">Sales</th>
                      <th className="px-4 py-3 text-right font-bold">Expenses</th>
                      <th className="px-4 py-3 text-right font-bold">P&amp;L</th>
                      <th className="px-4 py-3 text-right font-bold">Margin</th>
                      <th className="px-4 py-3 text-right font-bold">Freight % on Materials</th>
                      <th className="px-4 py-3 text-center font-bold">COs</th>
                      <th className="px-4 py-3 text-center font-bold">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredJobs.map((job) => {
                      const calc = calculateJob(job);
                      const coCount = job.lines.filter((line) => line.type === "changeOrder").length;

                      return (
                        <tr key={job.id} className="border-t border-slate-200 bg-white hover:bg-slate-50">
                          <td className="px-4 py-3 font-semibold text-slate-900">{job.jobNumber || "—"}</td>
                          <td className="px-4 py-3">{job.customer || "—"}</td>
                          <td className="max-w-[320px] truncate px-4 py-3">{job.description || "—"}</td>
                          <td className="px-4 py-3">{job.department || "—"}</td>
                          <td className="px-4 py-3">{job.status || "—"}</td>
                          <td className="px-4 py-3 text-center">
                            {job.reviewedByManagement ? (
                              <span className="inline-flex items-center justify-center rounded-full bg-emerald-100 px-2 py-1 text-xs font-bold text-emerald-700">
                                ✓
                              </span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">{formatCurrency(calc.sales)}</td>
                          <td className="px-4 py-3 text-right">{formatCurrency(calc.totalExpenses)}</td>
                          <td
                            className={`px-4 py-3 text-right font-semibold ${
                              calc.profitLoss >= 0 ? "text-emerald-600" : "text-red-600"
                            }`}
                          >
                            {formatCurrency(calc.profitLoss)}
                          </td>
                          <td
                            className={`px-4 py-3 text-right font-semibold ${
                              calc.margin >= 0 ? "text-emerald-600" : "text-red-600"
                            }`}
                          >
                            {formatPercent(calc.margin)}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-amber-600">
                            {formatPercent(
                              freightPercentOfMaterials(
                                job.lines.reduce((sum, line) => sum + toNumber(line.freightDelivery), 0),
                                job.lines.reduce((sum, line) => sum + toNumber(line.materials), 0)
                              )
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">{coCount}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                className="rounded-lg p-2 text-slate-500 hover:bg-sky-50 hover:text-sky-700"
                                onClick={() => setEditingJobId(job.id)}
                                title="Edit"
                                type="button"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button
                                className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-600"
                                onClick={() => deleteJob(job.id)}
                                title="Delete"
                                type="button"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {filteredJobs.length === 0 ? (
                      <tr>
                        <td colSpan={13} className="px-4 py-10 text-center text-slate-500">
                          No jobs found.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : activeTab === "reports" ? (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <StatCard
                title="Gross Profit / Loss"
                value={formatCurrency(adjustedReportTotals.grossProfitLoss)}
                accent={
                  adjustedReportTotals.grossProfitLoss >= 0
                    ? "text-emerald-600"
                    : "text-red-600"
                }
              />
              <StatCard
                title="Total Overhead"
                value={formatCurrency(adjustedReportTotals.totalOverhead)}
                accent="text-amber-600"
              />
              <StatCard
                title="Adjusted Profit / Loss"
                value={formatCurrency(adjustedReportTotals.adjustedProfitLoss)}
                accent={
                  adjustedReportTotals.adjustedProfitLoss >= 0
                    ? "text-emerald-600"
                    : "text-red-600"
                }
              />
              <StatCard
                title="Adjusted Margin"
                value={formatPercent(adjustedReportTotals.adjustedMargin)}
                accent={
                  adjustedReportTotals.adjustedMargin >= 0
                    ? "text-emerald-600"
                    : "text-red-600"
                }
              />
            </div>

            <div className="print-only report-print-header">
              <div className="report-print-company">Northeast Data</div>
              <div className="report-print-title">{reportTitle}</div>
              <div className="report-print-subtitle">
                Gross vs adjusted profitability after allocated overhead
              </div>

              <div className="report-print-meta">
                <div className="report-print-meta-item">
                  <div className="report-print-label">Department</div>
                  <div className="report-print-value">
                    {departmentFilter === "All Departments" ? "All Departments" : departmentFilter}
                  </div>
                </div>

                <div className="report-print-meta-item">
                  <div className="report-print-label">Printed</div>
                  <div className="report-print-value">{printedOn}</div>
                </div>

                <div className="report-print-meta-item">
                  <div className="report-print-label">Jobs</div>
                  <div className="report-print-value">{filteredJobs.length}</div>
                </div>

                <div className="report-print-meta-item">
                  <div className="report-print-label">Gross P&L</div>
                  <div className="report-print-value">
                    {formatCurrency(adjustedReportTotals.grossProfitLoss)}
                  </div>
                </div>
              </div>

              <div className="report-print-meta">
                <div className="report-print-meta-item">
                  <div className="report-print-label">Overhead</div>
                  <div className="report-print-value">
                    {formatCurrency(adjustedReportTotals.totalOverhead)}
                  </div>
                </div>

                <div className="report-print-meta-item">
                  <div className="report-print-label">Adjusted P&L</div>
                  <div className="report-print-value">
                    {formatCurrency(adjustedReportTotals.adjustedProfitLoss)}
                  </div>
                </div>

                <div className="report-print-meta-item">
                  <div className="report-print-label">Adjusted Margin</div>
                  <div className="report-print-value">
                    {formatPercent(adjustedReportTotals.adjustedMargin)}
                  </div>
                </div>

                <div className="report-print-meta-item">
                  <div className="report-print-label">Status</div>
                  <div className="report-print-value">Final</div>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 text-xl font-bold text-slate-900 no-print">
                Adjusted Job Profitability Report
              </div>
              <div className="overflow-x-auto rounded-2xl border border-slate-200">
                <table className="min-w-[1900px] text-sm">
                  <thead className="bg-slate-100 text-slate-700">
                    <tr>
                      <th className="px-4 py-3 text-left font-bold">Job #</th>
                      <th className="px-4 py-3 text-left font-bold">Customer</th>
                      <th className="px-4 py-3 text-left font-bold">Description</th>
                      <th className="px-4 py-3 text-left font-bold">Department</th>
                      <th className="px-4 py-3 text-center font-bold">Reviewed</th>
                      <th className="px-4 py-3 text-right font-bold">Sales</th>
                      <th className="px-4 py-3 text-right font-bold">Expenses</th>
                      <th className="px-4 py-3 text-right font-bold">Gross P&L</th>
                      <th className="px-4 py-3 text-right font-bold">Allocated Overhead</th>
                      <th className="px-4 py-3 text-right font-bold">Adjusted P&L</th>
                      <th className="px-4 py-3 text-right font-bold">Adjusted Margin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adjustedReportRows.map((row) => (
                      <React.Fragment key={row.job.id}>
                        <tr className="border-t-2 border-slate-400 bg-slate-100">
                          <td className="px-4 py-3 font-extrabold text-slate-900">
                            {row.job.jobNumber || "—"}
                            <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
                              Job Total
                            </div>
                          </td>
                          <td className="px-4 py-3 font-semibold text-slate-900">
                            {row.job.customer || "—"}
                          </td>
                          <td className="px-4 py-3 font-semibold text-slate-900">
                            {row.job.description || "—"}
                          </td>
                          <td className="px-4 py-3 font-semibold text-slate-900">
                            {row.job.department || "—"}
                          </td>
                          <td className="px-4 py-3 text-center font-bold text-slate-900">
                            {row.job.reviewedByManagement ? "✓" : "—"}
                          </td>
                          <td className="px-4 py-3 text-right font-extrabold text-slate-900">
                            {formatCurrency(row.calc.sales)}
                          </td>
                          <td className="px-4 py-3 text-right font-extrabold text-slate-900">
                            {formatCurrency(row.calc.totalExpenses)}
                          </td>
                          <td
                            className={`px-4 py-3 text-right font-extrabold ${
                              row.calc.profitLoss >= 0 ? "text-emerald-700" : "text-red-700"
                            }`}
                          >
                            {formatCurrency(row.calc.profitLoss)}
                          </td>
                          <td className="px-4 py-3 text-right font-extrabold text-amber-700">
                            {formatCurrency(row.allocatedOverhead)}
                          </td>
                          <td
                            className={`px-4 py-3 text-right font-extrabold ${
                              row.adjustedProfitLoss >= 0 ? "text-emerald-700" : "text-red-700"
                            }`}
                          >
                            {formatCurrency(row.adjustedProfitLoss)}
                          </td>
                          <td
                            className={`px-4 py-3 text-right font-extrabold ${
                              row.adjustedMargin >= 0 ? "text-emerald-700" : "text-red-700"
                            }`}
                          >
                            {formatPercent(row.adjustedMargin)}
                          </td>
                        </tr>

                        {row.job.lines.map((line) => {
                          const lineCalc = calculateLine(line);
                          return (
                            <tr
                              key={line.id}
                              className="border-t border-slate-100 bg-slate-50/70 text-slate-600"
                            >
                              <td className="px-4 py-2 pl-8 text-xs font-semibold uppercase tracking-[0.08em]">
                                {line.type === "main" ? "Main Job Detail" : "Change Order"}
                              </td>
                              <td className="px-4 py-2 text-xs">{line.itemNumber || "—"}</td>
                              <td className="px-4 py-2 text-xs">{line.description || "—"}</td>
                              <td className="px-4 py-2 text-xs">{row.job.department || "—"}</td>
                              <td className="px-4 py-2 text-center text-xs">—</td>
                              <td className="px-4 py-2 text-right text-xs">{formatCurrency(lineCalc.sales)}</td>
                              <td className="px-4 py-2 text-right text-xs">{formatCurrency(lineCalc.totalExpenses)}</td>
                              <td
                                className={`px-4 py-2 text-right text-xs font-semibold ${
                                  lineCalc.profitLoss >= 0 ? "text-emerald-600" : "text-red-600"
                                }`}
                              >
                                {formatCurrency(lineCalc.profitLoss)}
                              </td>
                              <td className="px-4 py-2 text-right text-xs">—</td>
                              <td className="px-4 py-2 text-right text-xs">—</td>
                              <td className="px-4 py-2 text-right text-xs">—</td>
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    ))}

                    {adjustedReportRows.length === 0 ? (
                      <tr>
                        <td colSpan={11} className="px-4 py-10 text-center text-slate-500">
                          No jobs found for this report.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 text-xl font-bold text-slate-900">
                Department Contribution Summary
              </div>
              <div className="overflow-x-auto rounded-2xl border border-slate-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-100 text-slate-700">
                    <tr>
                      <th className="px-4 py-3 text-left font-bold">Department</th>
                      <th className="px-4 py-3 text-right font-bold">Sales</th>
                      <th className="px-4 py-3 text-right font-bold">Expenses</th>
                      <th className="px-4 py-3 text-right font-bold">Gross P&L</th>
                      <th className="px-4 py-3 text-right font-bold">Overhead</th>
                      <th className="px-4 py-3 text-right font-bold">Adjusted Contribution</th>
                    </tr>
                  </thead>
                  <tbody>
                    {departmentContributionRows.map((row) => (
                      <tr key={row.department} className="border-t border-slate-200 bg-white">
                        <td className="px-4 py-3 font-semibold text-slate-900">{row.department}</td>
                        <td className="px-4 py-3 text-right">{formatCurrency(row.sales)}</td>
                        <td className="px-4 py-3 text-right">{formatCurrency(row.expenses)}</td>
                        <td
                          className={`px-4 py-3 text-right font-semibold ${
                            row.grossProfitLoss >= 0 ? "text-emerald-600" : "text-red-600"
                          }`}
                        >
                          {formatCurrency(row.grossProfitLoss)}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-amber-700">
                          {formatCurrency(row.overhead)}
                        </td>
                        <td
                          className={`px-4 py-3 text-right font-semibold ${
                            row.adjustedContribution >= 0
                              ? "text-emerald-700"
                              : "text-red-700"
                          }`}
                        >
                          {formatCurrency(row.adjustedContribution)}
                        </td>
                      </tr>
                    ))}
                    {departmentContributionRows.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                          No department contribution data found.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : activeTab === "overhead" ? (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <StatCard
                title="Total Overhead"
                value={formatCurrency(overheadTotals.total)}
                icon={<FileText className="h-4 w-4 text-slate-400" />}
              />
              <StatCard
                title="People Costs"
                value={formatCurrency(overheadTotals.people)}
                icon={<Users className="h-4 w-4 text-slate-400" />}
              />
              <StatCard
                title="Operating Costs"
                value={formatCurrency(overheadTotals.operating)}
                icon={<Laptop className="h-4 w-4 text-slate-400" />}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <StatCard
                title="Donations / Other"
                value={formatCurrency(overheadTotals.other)}
                icon={<Shield className="h-4 w-4 text-slate-400" />}
              />
              <StatCard
                title="Current Month"
                value={formatCurrency(overheadTotals.currentMonth)}
              />
              <StatCard
                title="Year to Date"
                value={formatCurrency(overheadTotals.ytd)}
              />
            </div>

            <div className="print-only report-print-header">
              <div className="report-print-company">Northeast Data</div>
              <div className="report-print-title">{overheadReportTitle}</div>
              <div className="report-print-subtitle">
                Non-billable overhead and department cost summary
              </div>

              <div className="report-print-meta">
                <div className="report-print-meta-item">
                  <div className="report-print-label">Department</div>
                  <div className="report-print-value">
                    {overheadDepartmentFilter === "All Departments"
                      ? "All Departments"
                      : overheadDepartmentFilter}
                  </div>
                </div>

                <div className="report-print-meta-item">
                  <div className="report-print-label">Printed</div>
                  <div className="report-print-value">{printedOn}</div>
                </div>

                <div className="report-print-meta-item">
                  <div className="report-print-label">Entries</div>
                  <div className="report-print-value">{filteredOverheadEntries.length}</div>
                </div>

                <div className="report-print-meta-item">
                  <div className="report-print-label">Total Overhead</div>
                  <div className="report-print-value">{formatCurrency(overheadTotals.total)}</div>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm no-print">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="text-xl font-bold text-slate-900">Overhead Entries</div>
                  <div className="mt-1 text-sm text-slate-500">
                    Track PTO, benefits, donations, shirts, safety supplies, PCs, office costs, and other non-billable expenses by department.
                  </div>
                </div>

                <div className="flex w-full flex-col gap-3 lg:w-auto lg:flex-row lg:items-center">
                  <div className="min-w-[200px]">
                    <Select
                      value={overheadDepartmentFilter}
                      onChange={(e) => setOverheadDepartmentFilter(e.target.value)}
                    >
                      <option value="All Departments">All Departments</option>
                      {departmentOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </Select>
                  </div>

                  <div className="min-w-[220px]">
                    <Select
                      value={overheadCategoryFilter}
                      onChange={(e) => setOverheadCategoryFilter(e.target.value)}
                    >
                      <option value="All Categories">All Categories</option>
                      {overheadCategoryOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </Select>
                  </div>

                  <div className="min-w-[150px]">
                    <Select
                      value={overheadMonthFilter}
                      onChange={(e) => setOverheadMonthFilter(e.target.value)}
                    >
                      <option value="All Months">All Months</option>
                      {Array.from({ length: 12 }).map((_, index) => {
                        const value = String(index + 1).padStart(2, "0");
                        return (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        );
                      })}
                    </Select>
                  </div>

                  <div className="min-w-[150px]">
                    <Select
                      value={overheadYearFilter}
                      onChange={(e) => setOverheadYearFilter(e.target.value)}
                    >
                      <option value="All Years">All Years</option>
                      {["2024", "2025", "2026", "2027", "2028"].map((year) => (
                        <option key={year} value={year}>
                          {year}
                        </option>
                      ))}
                    </Select>
                  </div>

                  <div className="relative w-full lg:w-[320px]">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      value={overheadSearch}
                      onChange={(e) => setOverheadSearch(e.target.value)}
                      placeholder="Search overhead..."
                      className="h-11 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3 text-sm outline-none focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 text-xl font-bold text-slate-900 no-print">
                Department Overhead Detail
              </div>
              <div className="overflow-x-auto rounded-2xl border border-slate-200">
                <table className="min-w-[1700px] text-sm">
                  <thead className="bg-slate-100 text-slate-700">
                    <tr>
                      <th className="px-4 py-3 text-left font-bold">Date</th>
                      <th className="px-4 py-3 text-left font-bold">Department</th>
                      <th className="px-4 py-3 text-left font-bold">Category</th>
                      <th className="px-4 py-3 text-left font-bold">Subcategory</th>
                      <th className="px-4 py-3 text-left font-bold">Description</th>
                      <th className="px-4 py-3 text-left font-bold">Vendor</th>
                      <th className="px-4 py-3 text-left font-bold">Employee</th>
                      <th className="px-4 py-3 text-center font-bold">Reviewed</th>
                      <th className="px-4 py-3 text-right font-bold">Amount</th>
                      <th className="px-4 py-3 text-center font-bold no-print">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOverheadEntries.map((entry) => (
                      <tr key={entry.id} className="border-t border-slate-200 bg-white hover:bg-slate-50">
                        <td className="px-4 py-3">{entry.date || "—"}</td>
                        <td className="px-4 py-3">{entry.department || "—"}</td>
                        <td className="px-4 py-3">{entry.category || "—"}</td>
                        <td className="px-4 py-3">{entry.subcategory || "—"}</td>
                        <td className="max-w-[320px] truncate px-4 py-3">{entry.description || "—"}</td>
                        <td className="px-4 py-3">{entry.vendor || "—"}</td>
                        <td className="px-4 py-3">{entry.employeeName || "—"}</td>
                        <td className="px-4 py-3 text-center">
                          {entry.reviewedByManagement ? "✓" : "—"}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-900">
                          {formatCurrency(entry.amount)}
                        </td>
                        <td className="px-4 py-3 no-print">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              className="rounded-lg p-2 text-slate-500 hover:bg-sky-50 hover:text-sky-700"
                              onClick={() => setEditingOverheadId(entry.id)}
                              title="Edit"
                              type="button"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-600"
                              onClick={() => deleteOverheadEntry(entry.id)}
                              title="Delete"
                              type="button"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredOverheadEntries.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="px-4 py-10 text-center text-slate-500">
                          No overhead entries found.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 text-xl font-bold text-slate-900">
                Department Overhead Summary
              </div>
              <div className="overflow-x-auto rounded-2xl border border-slate-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-100 text-slate-700">
                    <tr>
                      <th className="px-4 py-3 text-left font-bold">Department</th>
                      <th className="px-4 py-3 text-right font-bold">Total Overhead</th>
                      <th className="px-4 py-3 text-right font-bold">% of Total Overhead</th>
                    </tr>
                  </thead>
                  <tbody>
                    {departmentOverheadSummary.map((row) => {
                      const pct =
                        overheadTotals.total > 0 ? (row.total / overheadTotals.total) * 100 : 0;

                      return (
                        <tr key={row.department} className="border-t border-slate-200 bg-white">
                          <td className="px-4 py-3 font-semibold text-slate-900">{row.department}</td>
                          <td className="px-4 py-3 text-right">{formatCurrency(row.total)}</td>
                          <td className="px-4 py-3 text-right">{formatPercent(pct)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <StatCard
                title="Closed Job Actual P&L"
                value={formatCurrency(forecastTotals.closedActualProfitLoss)}
                accent={
                  forecastTotals.closedActualProfitLoss >= 0
                    ? "text-emerald-600"
                    : "text-red-600"
                }
              />
              <StatCard
                title="Open Job Projected P&L"
                value={formatCurrency(forecastTotals.openProjectedProfitLoss)}
                accent={
                  forecastTotals.openProjectedProfitLoss >= 0
                    ? "text-emerald-600"
                    : "text-red-600"
                }
              />
              <StatCard
                title="Projected Gross P&L"
                value={formatCurrency(forecastTotals.projectedGrossProfitLoss)}
                accent={
                  forecastTotals.projectedGrossProfitLoss >= 0
                    ? "text-emerald-600"
                    : "text-red-600"
                }
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <StatCard
                title="Projected Overhead"
                value={formatCurrency(forecastTotals.projectedOverhead)}
                accent="text-amber-600"
              />
              <StatCard
                title="Projected Year-End P&L"
                value={formatCurrency(forecastTotals.projectedYearEndProfitLoss)}
                accent={
                  forecastTotals.projectedYearEndProfitLoss >= 0
                    ? "text-emerald-600"
                    : "text-red-600"
                }
              />
              <StatCard
                title="Projected Year-End Margin"
                value={formatPercent(projectedYearEndMargin)}
                accent={
                  projectedYearEndMargin >= 0 ? "text-emerald-600" : "text-red-600"
                }
              />
            </div>

            <div className="print-only report-print-header">
              <div className="report-print-company">Northeast Data</div>
              <div className="report-print-title">{forecastReportTitle}</div>
              <div className="report-print-subtitle">
                Projected year-end profitability based on current job forecasts
              </div>

              <div className="report-print-meta">
                <div className="report-print-meta-item">
                  <div className="report-print-label">Department</div>
                  <div className="report-print-value">
                    {departmentFilter === "All Departments" ? "All Departments" : departmentFilter}
                  </div>
                </div>

                <div className="report-print-meta-item">
                  <div className="report-print-label">Printed</div>
                  <div className="report-print-value">{printedOn}</div>
                </div>

                <div className="report-print-meta-item">
                  <div className="report-print-label">Jobs</div>
                  <div className="report-print-value">{forecastRows.length}</div>
                </div>

                <div className="report-print-meta-item">
                  <div className="report-print-label">Projected Year-End P&L</div>
                  <div className="report-print-value">
                    {formatCurrency(forecastTotals.projectedYearEndProfitLoss)}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm no-print">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="text-xl font-bold text-slate-900">Forecast Filters</div>
                  <div className="mt-1 text-sm text-slate-500">
                    Use current actuals for closed jobs and estimated finals for open jobs where entered.
                  </div>
                </div>

                <div className="flex w-full flex-col gap-3 lg:w-auto lg:flex-row lg:items-center">
                  <div className="min-w-[180px]">
                    <Select
                      value={forecastStatusFilter}
                      onChange={(e) => setForecastStatusFilter(e.target.value)}
                    >
                      <option value="All Statuses">All Statuses</option>
                      <option value="Open">Open</option>
                      <option value="Closed">Closed</option>
                    </Select>
                  </div>

                  <div className="min-w-[180px]">
                    <Select
                      value={forecastConfidenceFilter}
                      onChange={(e) => setForecastConfidenceFilter(e.target.value)}
                    >
                      <option value="All Confidence">All Confidence</option>
                      {forecastConfidenceOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </Select>
                  </div>

                  <div className="relative w-full lg:w-[320px]">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      value={forecastSearch}
                      onChange={(e) => setForecastSearch(e.target.value)}
                      placeholder="Search forecast jobs..."
                      className="h-11 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3 text-sm outline-none focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 text-xl font-bold text-slate-900 no-print">
                Forecast by Job
              </div>
              <div className="overflow-x-auto rounded-2xl border border-slate-200">
                <table className="min-w-[2300px] text-sm">
                  <thead className="bg-slate-100 text-slate-700">
                    <tr>
                      <th className="px-4 py-3 text-left font-bold">Job #</th>
                      <th className="px-4 py-3 text-left font-bold">Customer</th>
                      <th className="px-4 py-3 text-left font-bold">Department</th>
                      <th className="px-4 py-3 text-left font-bold">Status</th>
                      <th className="px-4 py-3 text-right font-bold">Actual Sales</th>
                      <th className="px-4 py-3 text-right font-bold">Actual Expenses</th>
                      <th className="px-4 py-3 text-right font-bold">Actual Gross P&L</th>
                      <th className="px-4 py-3 text-right font-bold">Estimated Final Sales</th>
                      <th className="px-4 py-3 text-right font-bold">Estimated Final Expenses</th>
                      <th className="px-4 py-3 text-right font-bold">Projected Final Gross P&L</th>
                      <th className="px-4 py-3 text-right font-bold">Allocated Overhead</th>
                      <th className="px-4 py-3 text-right font-bold">Projected Final Adjusted P&L</th>
                      <th className="px-4 py-3 text-right font-bold">Projected Final Adjusted Margin</th>
                      <th className="px-4 py-3 text-right font-bold">% Complete</th>
                      <th className="px-4 py-3 text-left font-bold">Confidence</th>
                      <th className="px-4 py-3 text-left font-bold">Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {forecastRows.map((row) => (
                      <tr key={row.job.id} className="border-t border-slate-200 bg-white">
                        <td className="px-4 py-3 font-semibold text-slate-900">
                          {row.job.jobNumber || "—"}
                        </td>
                        <td className="px-4 py-3">{row.job.customer || "—"}</td>
                        <td className="px-4 py-3">{row.job.department || "—"}</td>
                        <td className="px-4 py-3">{row.job.status || "—"}</td>
                        <td className="px-4 py-3 text-right">{formatCurrency(row.actualSales)}</td>
                        <td className="px-4 py-3 text-right">{formatCurrency(row.actualExpenses)}</td>
                        <td
                          className={`px-4 py-3 text-right font-semibold ${
                            row.actualGrossProfitLoss >= 0
                              ? "text-emerald-600"
                              : "text-red-600"
                          }`}
                        >
                          {formatCurrency(row.actualGrossProfitLoss)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {formatCurrency(
                            toNumber(row.job.estimatedFinalSales) || row.forecastSales
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {formatCurrency(
                            toNumber(row.job.estimatedFinalExpenses) || row.forecastExpenses
                          )}
                        </td>
                        <td
                          className={`px-4 py-3 text-right font-semibold ${
                            row.projectedFinalGrossProfitLoss >= 0
                              ? "text-emerald-600"
                              : "text-red-600"
                          }`}
                        >
                          {formatCurrency(row.projectedFinalGrossProfitLoss)}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-amber-700">
                          {formatCurrency(row.allocatedOverhead)}
                        </td>
                        <td
                          className={`px-4 py-3 text-right font-semibold ${
                            row.projectedFinalAdjustedProfitLoss >= 0
                              ? "text-emerald-700"
                              : "text-red-700"
                          }`}
                        >
                          {formatCurrency(row.projectedFinalAdjustedProfitLoss)}
                        </td>
                        <td
                          className={`px-4 py-3 text-right font-semibold ${
                            row.projectedFinalAdjustedMargin >= 0
                              ? "text-emerald-700"
                              : "text-red-700"
                          }`}
                        >
                          {formatPercent(row.projectedFinalAdjustedMargin)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {row.job.percentComplete ? `${row.job.percentComplete}%` : "—"}
                        </td>
                        <td className={`px-4 py-3 font-semibold ${confidenceAccent(row.job.forecastConfidence || "Medium")}`}>
                          {row.job.forecastConfidence || "Medium"}
                        </td>
                        <td className="px-4 py-3">{row.source}</td>
                      </tr>
                    ))}
                    {forecastRows.length === 0 ? (
                      <tr>
                        <td colSpan={16} className="px-4 py-10 text-center text-slate-500">
                          No forecast jobs found.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 text-xl font-bold text-slate-900">
                Department Forecast Summary
              </div>
              <div className="overflow-x-auto rounded-2xl border border-slate-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-100 text-slate-700">
                    <tr>
                      <th className="px-4 py-3 text-left font-bold">Department</th>
                      <th className="px-4 py-3 text-right font-bold">Closed Job Actual P&L</th>
                      <th className="px-4 py-3 text-right font-bold">Open Job Projected P&L</th>
                      <th className="px-4 py-3 text-right font-bold">Projected Gross Total</th>
                      <th className="px-4 py-3 text-right font-bold">Projected Overhead</th>
                      <th className="px-4 py-3 text-right font-bold">Projected Adjusted Contribution</th>
                    </tr>
                  </thead>
                  <tbody>
                    {forecastDepartmentRows.map((row) => (
                      <tr key={row.department} className="border-t border-slate-200 bg-white">
                        <td className="px-4 py-3 font-semibold text-slate-900">{row.department}</td>
                        <td
                          className={`px-4 py-3 text-right ${
                            row.closedActualProfitLoss >= 0
                              ? "text-emerald-600"
                              : "text-red-600"
                          }`}
                        >
                          {formatCurrency(row.closedActualProfitLoss)}
                        </td>
                        <td
                          className={`px-4 py-3 text-right ${
                            row.openProjectedProfitLoss >= 0
                              ? "text-emerald-600"
                              : "text-red-600"
                          }`}
                        >
                          {formatCurrency(row.openProjectedProfitLoss)}
                        </td>
                        <td
                          className={`px-4 py-3 text-right font-semibold ${
                            row.projectedGrossProfitLoss >= 0
                              ? "text-emerald-600"
                              : "text-red-600"
                          }`}
                        >
                          {formatCurrency(row.projectedGrossProfitLoss)}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-amber-700">
                          {formatCurrency(row.projectedOverhead)}
                        </td>
                        <td
                          className={`px-4 py-3 text-right font-semibold ${
                            row.projectedAdjustedContribution >= 0
                              ? "text-emerald-700"
                              : "text-red-700"
                          }`}
                        >
                          {formatCurrency(row.projectedAdjustedContribution)}
                        </td>
                      </tr>
                    ))}
                    {forecastDepartmentRows.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                          No forecast department data found.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {activeJob ? (
        <JobEditorModal
          job={activeJob}
          onClose={() => setEditingJobId(null)}
          onSave={saveJob}
        />
      ) : null}

      {activeOverheadEntry ? (
        <OverheadEntryModal
          entry={activeOverheadEntry}
          onClose={() => setEditingOverheadId(null)}
          onSave={saveOverheadEntry}
        />
      ) : null}

      {showQbPasteModal ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/55 p-4 md:p-8">
          <div className="w-full max-w-6xl rounded-[28px] border border-slate-200 bg-slate-50 shadow-2xl">
            <div className="flex items-center justify-between rounded-t-[28px] border-b border-slate-200 bg-white px-6 py-4">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-sky-700">
                  QuickBooks Import
                </div>
                <div className="mt-1 text-2xl font-bold text-slate-900">
                  Paste QuickBooks P&amp;L
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={importQuickBooksPaste}>
                  <Save className="h-4 w-4" /> Import Entries
                </Button>
                <Button variant="ghost" onClick={() => setShowQbPasteModal(false)}>
                  <X className="h-4 w-4" /> Close
                </Button>
              </div>
            </div>

            <div className="space-y-6 p-6">
              <div className="grid gap-4 md:grid-cols-3">
                <Select
                  label="Department"
                  value={qbPasteDepartment}
                  onChange={(e) => setQbPasteDepartment(e.target.value)}
                >
                  {departmentOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </Select>

                <Input
                  label="Entry Date"
                  type="date"
                  value={qbPasteDate}
                  onChange={(e) => setQbPasteDate(e.target.value)}
                />

                <StatCard
                  title="Preview Rows"
                  value={String(qbPastePreviewRows.length)}
                />
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <Textarea
                  label="Paste QuickBooks P&L Here"
                  value={qbPasteText}
                  onChange={(e) => setQbPasteText(e.target.value)}
                  placeholder={`Example:
Employee Benefits\t1,250.00
Payroll Taxes\t845.22
Office Supplies\t212.44
Charitable Contributions\t500.00`}
                  className="min-h-[260px]"
                />
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 text-lg font-bold text-slate-900">Import Preview</div>
                <div className="overflow-x-auto rounded-2xl border border-slate-200">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-100 text-slate-700">
                      <tr>
                        <th className="px-4 py-3 text-left font-bold">QB Account</th>
                        <th className="px-4 py-3 text-left font-bold">Mapped Category</th>
                        <th className="px-4 py-3 text-left font-bold">Department</th>
                        <th className="px-4 py-3 text-right font-bold">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {qbPastePreviewRows.map((row) => (
                        <tr key={row.id} className="border-t border-slate-200 bg-white">
                          <td className="px-4 py-3">{row.subcategory || "—"}</td>
                          <td className="px-4 py-3">{row.category || "—"}</td>
                          <td className="px-4 py-3">{row.department || "—"}</td>
                          <td className="px-4 py-3 text-right">{formatCurrency(row.amount)}</td>
                        </tr>
                      ))}
                      {qbPastePreviewRows.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-4 py-10 text-center text-slate-500">
                            Paste QuickBooks P&amp;L lines above to preview the import.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
