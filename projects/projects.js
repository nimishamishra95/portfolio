import { fetchJSON, renderProjects } from '../global.js';
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

const projects = await fetchJSON('../lib/projects.json');
const projectsContainer = document.querySelector('.projects');

const titleEl = document.querySelector('.projects-title');
if (titleEl) titleEl.textContent = `Projects (${projects.length})`;

let query = '';
let selectedYear = null;

const arcGenerator = d3.arc().innerRadius(0).outerRadius(50);
const colors = d3.scaleOrdinal(d3.schemeTableau10);

function getFilteredBySearch() {
  return projects.filter((project) => {
    const values = Object.values(project).join('\n').toLowerCase();
    return values.includes(query.toLowerCase());
  });
}

function applyFilters() {
  let filtered = getFilteredBySearch();

  if (selectedYear !== null) {
    filtered = filtered.filter((p) => p.year === selectedYear);
  }

  renderProjects(filtered, projectsContainer, 'h2');
}

function renderPieChart(projectsGiven) {
  const rolledData = d3.rollups(projectsGiven, (v) => v.length, (d) => d.year);
  const data = rolledData.map(([year, count]) => ({ value: count, label: year }));

  const svg = d3.select('#projects-pie-plot');
  svg.selectAll('path').remove();
  const legend = d3.select('.legend');
  legend.selectAll('li').remove();

  if (data.length === 0) return;

  let selectedIndex = selectedYear !== null
    ? data.findIndex((d) => d.label === selectedYear)
    : -1;

  const sliceGenerator = d3.pie().value((d) => d.value);
  const arcData = sliceGenerator(data);
  const arcs = arcData.map((d) => arcGenerator(d));

  arcs.forEach((arc, i) => {
    svg
      .append('path')
      .attr('d', arc)
      .attr('fill', colors(i))
      .attr('class', i === selectedIndex ? 'selected' : '')
      .on('click', () => {
        const clickedYear = data[i].label;
        selectedYear = selectedYear === clickedYear ? null : clickedYear;
        selectedIndex = selectedYear !== null
          ? data.findIndex((d) => d.label === selectedYear)
          : -1;

        svg.selectAll('path')
          .attr('class', (_, idx) => idx === selectedIndex ? 'selected' : '');
        legend.selectAll('li')
          .attr('class', (_, idx) =>
            idx === selectedIndex ? 'legend-item selected' : 'legend-item'
          );

        applyFilters();
      });
  });

  data.forEach((d, idx) => {
    legend
      .append('li')
      .attr('class', idx === selectedIndex ? 'legend-item selected' : 'legend-item')
      .attr('style', `--color:${colors(idx)}`)
      .html(`<span class="swatch"></span> ${d.label} <em>(${d.value})</em>`)
      .on('click', () => {
        selectedYear = selectedYear === d.label ? null : d.label;
        selectedIndex = selectedYear !== null
          ? data.findIndex((dl) => dl.label === selectedYear)
          : -1;

        svg.selectAll('path')
          .attr('class', (_, i) => i === selectedIndex ? 'selected' : '');
        legend.selectAll('li')
          .attr('class', (_, i) =>
            i === selectedIndex ? 'legend-item selected' : 'legend-item'
          );

        applyFilters();
      });
  });
}

renderProjects(projects, projectsContainer, 'h2');
renderPieChart(projects);

const searchInput = document.querySelector('.searchBar');
searchInput.addEventListener('input', (event) => {
  query = event.target.value;
  const filtered = getFilteredBySearch();
  renderPieChart(filtered);
  applyFilters();
});