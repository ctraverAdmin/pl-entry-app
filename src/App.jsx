import React, { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Briefcase,
  FileText,
  Pencil,
  Plus,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react";

const STORAGE_KEY = "pl_entry_jobs_v5";
const departmentOptions = [
  "Installation",
  "Design",
  "Network",
  "Sales",
  "Network Integration",
];

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
    lines: [emptyLine("main", "MAIN")],
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

function StatCard({ title, value, accent = "text-slate-900" }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
        {title}
      </div>
      <div className={`mt-2 text-2xl font-bold ${accent}`}>{value}</div>
    </div>
  );
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
                    onChange={(e) => updateLineField(selectedLine.id, "itemNumber", e.target.value)}
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
                    onChange={(e) => updateLineField(selectedLine.id, "description", e.target.value)}
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
                          onChange={(e) => updateLineField(selectedLine.id, key, e.target.value)}
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

export default function App() {
  const [jobs, setJobs] = useState([]);
  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("All Departments");
  const [activeTab, setActiveTab] = useState("jobs");
  const [editingJobId, setEditingJobId] = useState(null);

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

  const overallTotals = useMemo(() => {
    return totalsForJobs(jobs);
  }, [jobs]);

  const filteredTotals = useMemo(() => {
    return totalsForJobs(filteredJobs);
  }, [filteredJobs]);

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

  const activeJob = jobs.find((job) => job.id === editingJobId) || null;

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

  const exportAll = () => {
    exportJson("profit-loss-jobs.json", jobs);
  };

  const printReport = () => {
    setActiveTab("reports");
    setTimeout(() => {
      window.print();
    }, 150);
  };

  const exportReport = () => {
    const report = filteredJobs.map((job) => {
      const calc = calculateJob(job);
      return {
        jobNumber: job.jobNumber,
        customer: job.customer,
        description: job.description,
        department: job.department,
        status: job.status,
        sales: calc.sales,
        totalExpenses: calc.totalExpenses,
        profitLoss: calc.profitLoss,
        margin: Number(calc.margin.toFixed(2)),
        lineCount: job.lines.length,
      };
    });

    exportJson("profit-loss-report.json", report);
  };

  const reportTitle =
    departmentFilter === "All Departments"
      ? "Profitability Report"
      : `${departmentFilter} Profitability Report`;

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
                Job + Change Order Tracking
              </div>
              <h1 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">
                Main Job P&amp;L and Change Order P&amp;L in One App
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-200 md:text-base">
                Create a parent job, add change orders under the same job, track separate profitability for each line, and view rolled-up totals for the full project.
              </p>
            </div>
            <div className="flex gap-2">
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
            </div>
          </div>
        </div>

        {activeTab === "jobs" ? (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <StatCard title="Visible Jobs" value={String(filteredJobs.length)} />
              <StatCard
                title={
                  departmentFilter === "All Departments"
                    ? "Overall Profit / Loss"
                    : `${departmentFilter} Profit / Loss`
                }
                value={formatCurrency(filteredTotals.profitLoss)}
                accent={filteredTotals.profitLoss >= 0 ? "text-emerald-600" : "text-red-600"}
              />
              <StatCard
                title={
                  departmentFilter === "All Departments"
                    ? "Overall Freight % of Materials"
                    : `${departmentFilter} Freight % of Materials`
                }
                value={formatPercent(filteredFreightPct)}
                accent="text-amber-600"
              />
              <StatCard
                title={
                  departmentFilter === "All Departments"
                    ? "Overall Margin"
                    : `${departmentFilter} Margin`
                }
                value={formatPercent(filteredMargin)}
                accent={filteredMargin >= 0 ? "text-emerald-600" : "text-red-600"}
              />
              <StatCard
                title={
                  departmentFilter === "All Departments"
                    ? "Filtered Profit / Loss (All)"
                    : `${departmentFilter} Profit / Loss`
                }
                value={formatCurrency(filteredTotals.profitLoss)}
                accent={filteredTotals.profitLoss >= 0 ? "text-emerald-600" : "text-red-600"}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <StatCard
                title={departmentFilter === "All Departments" ? "Filtered Materials" : `${departmentFilter} Materials`}
                value={formatCurrency(filteredTotals.materials)}
              />
              <StatCard
                title={departmentFilter === "All Departments" ? "Filtered Freight" : `${departmentFilter} Freight`}
                value={formatCurrency(filteredTotals.freightDelivery)}
              />
              <StatCard
                title={departmentFilter === "All Departments" ? "Filtered Freight % of Materials" : `${departmentFilter} Freight % of Materials`}
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
                        <td colSpan={12} className="px-4 py-10 text-center text-slate-500">
                          No jobs found.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : (
          <div className="space-y-6">
            <div className="no-print grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <StatCard title="Report Jobs" value={String(filteredJobs.length)} />
              <StatCard
                title="Report Sales"
                value={formatCurrency(filteredTotals.sales)}
              />
              <StatCard
                title={
                  departmentFilter === "All Departments"
                    ? "Filtered Profit / Loss (All)"
                    : `${departmentFilter} Profit / Loss`
                }
                value={formatCurrency(filteredTotals.profitLoss)}
                accent={filteredTotals.profitLoss >= 0 ? "text-emerald-600" : "text-red-600"}
              />
              <StatCard
                title="Filtered Margin"
                value={formatPercent(filteredMargin)}
                accent={filteredMargin >= 0 ? "text-emerald-600" : "text-red-600"}
              />
              <StatCard
                title="Filtered Freight % of Materials"
                value={formatPercent(filteredFreightPct)}
                accent="text-amber-600"
              />
            </div>

            <div className="print-only report-print-header">
              <div className="report-print-company">Northeast Data</div>
              <div className="report-print-title">{reportTitle}</div>
              <div className="report-print-subtitle">
                Project profitability summary by job
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
                  <div className="report-print-label">Sales</div>
                  <div className="report-print-value">{formatCurrency(filteredTotals.sales)}</div>
                </div>
              </div>

              <div className="report-print-meta">
                <div className="report-print-meta-item">
                  <div className="report-print-label">Profit / Loss</div>
                  <div className="report-print-value">{formatCurrency(filteredTotals.profitLoss)}</div>
                </div>

                <div className="report-print-meta-item">
                  <div className="report-print-label">Margin</div>
                  <div className="report-print-value">{formatPercent(filteredMargin)}</div>
                </div>

                <div className="report-print-meta-item">
                  <div className="report-print-label">Freight % of Materials</div>
                  <div className="report-print-value">{formatPercent(filteredFreightPct)}</div>
                </div>

                <div className="report-print-meta-item">
                  <div className="report-print-label">Status</div>
                  <div className="report-print-value">Final</div>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 text-xl font-bold text-slate-900 no-print">
                Job Profitability Report
              </div>
              <div className="overflow-x-auto rounded-2xl border border-slate-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-100 text-slate-700">
                    <tr>
                      <th className="px-4 py-3 text-left font-bold">Job #</th>
                      <th className="px-4 py-3 text-left font-bold">Customer</th>
                      <th className="px-4 py-3 text-left font-bold">Description</th>
                      <th className="px-4 py-3 text-left font-bold">Department</th>
                      <th className="px-4 py-3 text-right font-bold">Sales</th>
                      <th className="px-4 py-3 text-right font-bold">Expenses</th>
                      <th className="px-4 py-3 text-right font-bold">P&amp;L</th>
                      <th className="px-4 py-3 text-right font-bold">Margin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredJobs.map((job) => {
                      const calc = calculateJob(job);
                      return (
                        <React.Fragment key={job.id}>
                          <tr className="border-t-2 border-slate-400 bg-slate-100">
                            <td className="px-4 py-3 font-extrabold text-slate-900">
                              {job.jobNumber || "—"}
                              <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
                                Job Total
                              </div>
                            </td>
                            <td className="px-4 py-3 font-semibold text-slate-900">
                              {job.customer || "—"}
                            </td>
                            <td className="px-4 py-3 font-semibold text-slate-900">
                              {job.description || "—"}
                            </td>
                            <td className="px-4 py-3 font-semibold text-slate-900">
                              {job.department || "—"}
                            </td>
                            <td className="px-4 py-3 text-right font-extrabold text-slate-900">
                              {formatCurrency(calc.sales)}
                            </td>
                            <td className="px-4 py-3 text-right font-extrabold text-slate-900">
                              {formatCurrency(calc.totalExpenses)}
                            </td>
                            <td
                              className={`px-4 py-3 text-right font-extrabold ${
                                calc.profitLoss >= 0 ? "text-emerald-700" : "text-red-700"
                              }`}
                            >
                              {formatCurrency(calc.profitLoss)}
                            </td>
                            <td
                              className={`px-4 py-3 text-right font-extrabold ${
                                calc.margin >= 0 ? "text-emerald-700" : "text-red-700"
                              }`}
                            >
                              {formatPercent(calc.margin)}
                            </td>
                          </tr>
                          {job.lines.map((line) => {
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
                                <td className="px-4 py-2 text-xs">{job.department || "—"}</td>
                                <td className="px-4 py-2 text-right text-xs">{formatCurrency(lineCalc.sales)}</td>
                                <td className="px-4 py-2 text-right text-xs">{formatCurrency(lineCalc.totalExpenses)}</td>
                                <td
                                  className={`px-4 py-2 text-right text-xs font-semibold ${
                                    lineCalc.profitLoss >= 0 ? "text-emerald-600" : "text-red-600"
                                  }`}
                                >
                                  {formatCurrency(lineCalc.profitLoss)}
                                </td>
                                <td
                                  className={`px-4 py-2 text-right text-xs font-semibold ${
                                    lineCalc.margin >= 0 ? "text-emerald-600" : "text-red-600"
                                  }`}
                                >
                                  {formatPercent(lineCalc.margin)}
                                </td>
                              </tr>
                            );
                          })}
                        </React.Fragment>
                      );
                    })}
                    {filteredJobs.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-10 text-center text-slate-500">
                          No jobs found for this report.
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
    </div>
  );
}