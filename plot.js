const margin = { top: 50, right: 40, bottom: 50, left: 60 };
const width = 1100 - margin.left - margin.right;
const height = 400 - margin.top - margin.bottom;

const svg = d3.select("svg")
  .attr("width", width + margin.left + margin.right)
  .attr("height", height + margin.top + margin.bottom)
  .append("g")
  .attr("transform", `translate(${margin.left},${margin.top})`);

const tooltip = d3.select("#tooltip");
const drugSelect = d3.select("#drugSelect");
const vitalSelect = d3.select("#vitalSelect");
const groupSelect = d3.select("#groupSelect");

const x = d3.scaleLinear().domain([0, 1]).range([0, width]);
const y = d3.scaleLinear().range([height, 0]);

svg.append("g").attr("transform", `translate(0,${height})`).attr("class", "x-axis");
svg.append("g").attr("class", "y-axis");

svg.append("text")
  .attr("text-anchor", "middle")
  .attr("x", width / 2)
  .attr("y", height + margin.bottom - 5)
  .attr("class", "axis-label")
  .text("Progress Through Surgery");

svg.append("text")
  .attr("text-anchor", "middle")
  .attr("transform", `rotate(-90)`)
  .attr("x", -height / 2)
  .attr("y", -margin.left + 15)
  .attr("class", "axis-label")
  .text("Average Vital Value");

const xAxis = d3.axisBottom(x).tickFormat(d3.format(".0%"));
const yAxis = d3.axisLeft(y);

const line = d3.line()
  .x(d => x(d.norm_time))
  .y(d => y(d.mean))
  .curve(d3.curveMonotoneX);

const color = d3.scaleOrdinal(d3.schemeCategory10);

let activeGroups = new Set();

Promise.all([
  d3.csv("data/long_surgery_vitals.csv", d3.autoType),
  d3.csv("data/anesthetic_start_times.csv", d3.autoType)
]).then(([data, anesthetics]) => {
  data.forEach(d => d.signal = d.signal.toLowerCase());

  const vitals = [...new Set(data.map(d => d.signal))];
  const groups = ["optype", "emop"];

  vitalSelect.selectAll("option")
    .data(vitals)
    .enter()
    .append("option")
    .text(d => d.toUpperCase())
    .attr("value", d => d);

  groupSelect.selectAll("option")
    .data(groups)
    .enter()
    .append("option")
    .text(d => d === "optype" ? "Surgery Type" : "Emergency Status")
    .attr("value", d => d);

  const allDrugs = [...new Set(anesthetics.map(d => d.tname).filter(name => name.toLowerCase().includes("rate")))];
  const drugNameMap = {
    "orchestra/rftn20_rate": "Remifentanil",
    "orchestra/ppf20_rate": "Propofol"
  };

  drugSelect.selectAll("option")
    .data(["All", ...allDrugs])
    .enter().append("option")
    .text(d => d === "All" ? "All" : drugNameMap[d.toLowerCase()] || d)
    .attr("value", d => d);

  anesthetics.forEach(d => {
    d.tname = d.tname.toLowerCase();
    d.optype = d.optype.trim();
  });

  function updateChart() {
    const selectedVital = vitalSelect.property("value");
    const selectedGroup = groupSelect.property("value");
    const selectedDrug = drugSelect.property("value").toLowerCase();

    const filtered = data.filter(d => d.signal === selectedVital);

    const nested = d3.groups(filtered, d => d[selectedGroup]);

    const summary = nested.map(([key, values]) => {
      const binSize = 0.01;
      const binned = d3.groups(values, d => Math.round(d.norm_time / binSize) * binSize)
        .map(([t, pts]) => {
          const v = pts.map(p => p.value);
          const mean = d3.mean(v);
          const sd = d3.deviation(v);
          return {
            norm_time: +t,
            mean,
            sd,
            value: v[0]
          };
        });
      return { key, values: binned.sort((a, b) => a.norm_time - b.norm_time) };
    });

    const visible = summary.filter(d => activeGroups.size === 0 || activeGroups.has(d.key));

    y.domain([
      d3.min(visible, s => d3.min(s.values, d => d.mean - (d.sd || 0))),
      d3.max(visible, s => d3.max(s.values, d => d.mean + (d.sd || 0)))
    ]);

    svg.select(".x-axis").call(xAxis);
    svg.select(".y-axis").call(yAxis);

    svg.selectAll(".line").data(visible, d => d.key)
      .join("path")
      .attr("class", "line")
      .attr("fill", "none")
      .attr("stroke", d => color(d.key))
      .attr("stroke-width", 2)
      .attr("d", d => line(d.values));
  }

  vitalSelect.on("change", updateChart);
  groupSelect.on("change", updateChart);
  drugSelect.on("change", updateChart);

  vitalSelect.property("value", "map");
  groupSelect.property("value", "emop");
  drugSelect.property("value", "All");

  updateChart();
});