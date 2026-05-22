import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
import scrollama from 'https://cdn.jsdelivr.net/npm/scrollama@3.2.0/+esm';

// ── Step 1.1: Load CSV ────────────────────────────────────────────────────────
async function loadData() {
  const data = await d3.csv('loc.csv', (row) => ({
    ...row,
    line: Number(row.line),
    depth: Number(row.depth),
    length: Number(row.length),
    date: new Date(row.date + 'T00:00' + row.timezone),
    datetime: new Date(row.datetime),
  }));
  return data;
}

// ── Step 1.2: Process commits ─────────────────────────────────────────────────
function processCommits(data) {
  return d3
    .groups(data, (d) => d.commit)
    .map(([commit, lines]) => {
      let first = lines[0];
      let { author, date, time, timezone, datetime } = first;
      let ret = {
        id: commit,
        url: 'https://github.com/nimishamishra95/portfolio/commit/' + commit,
        author,
        date,
        time,
        timezone,
        datetime,
        hourFrac: datetime.getHours() + datetime.getMinutes() / 60,
        totalLines: lines.length,
      };
      Object.defineProperty(ret, 'lines', {
        value: lines,
        configurable: true,
        writable: true,
        enumerable: false,
      });
      return ret;
    })
    .sort((a, b) => a.datetime - b.datetime); // sort ascending for scrollytelling
}

// ── Summary stats ─────────────────────────────────────────────────────────────
function renderCommitInfo(data, commits) {
  const container = d3.select('#stats');
  container.selectAll('*').remove();
  const dl = container.append('dl').attr('class', 'stats');

  dl.append('dt').html('Total <abbr title="Lines of code">LOC</abbr>');
  dl.append('dd').text(data.length);

  dl.append('dt').text('Total Commits');
  dl.append('dd').text(commits.length);

  dl.append('dt').text('Number of Files');
  dl.append('dd').text(d3.group(data, (d) => d.file).size);

  const fileLengths = d3.rollups(data, (v) => d3.max(v, (v) => v.line), (d) => d.file);
  dl.append('dt').text('Avg File Length');
  dl.append('dd').text(Math.round(d3.mean(fileLengths, (d) => d[1])) + ' lines');

  dl.append('dt').text('Max File Length');
  dl.append('dd').text(d3.max(fileLengths, (d) => d[1]) + ' lines');

  dl.append('dt').text('Avg Line Length');
  dl.append('dd').text(Math.round(d3.mean(data, (d) => d.length)) + ' chars');

  const workByPeriod = d3.rollups(
    data,
    (v) => v.length,
    (d) => new Date(d.datetime).toLocaleString('en', { dayPeriod: 'short' }),
  );
  const maxPeriod = d3.greatest(workByPeriod, (d) => d[1])?.[0];
  dl.append('dt').text('Most Active Period');
  dl.append('dd').text(maxPeriod ?? 'N/A');
}

// ── Tooltip helpers ───────────────────────────────────────────────────────────
function renderTooltipContent(commit) {
  if (!commit || Object.keys(commit).length === 0) return;
  document.getElementById('commit-link').href = commit.url;
  document.getElementById('commit-link').textContent = commit.id.slice(0, 7);
  document.getElementById('commit-date').textContent = commit.datetime?.toLocaleString('en', { dateStyle: 'full' });
  document.getElementById('commit-time-tooltip').textContent = commit.time;
  document.getElementById('commit-author').textContent = commit.author;
  document.getElementById('commit-lines').textContent = commit.totalLines;
}

function updateTooltipVisibility(isVisible) {
  document.getElementById('commit-tooltip').hidden = !isVisible;
}

function updateTooltipPosition(event) {
  const tooltip = document.getElementById('commit-tooltip');
  tooltip.style.left = `${event.clientX + 12}px`;
  tooltip.style.top = `${event.clientY + 12}px`;
}

// ── Scales (module-level so updateScatterPlot can access them) ────────────────
let xScale, yScale;

function isCommitSelected(selection, commit) {
  if (!selection) return false;
  const [[x0, y0], [x1, y1]] = selection;
  const cx = xScale(commit.datetime);
  const cy = yScale(commit.hourFrac);
  return cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1;
}

function renderSelectionCount(selection, commits) {
  const selectedCommits = selection
    ? commits.filter((d) => isCommitSelected(selection, d))
    : [];
  document.querySelector('#selection-count').textContent =
    `${selectedCommits.length || 'No'} commits selected`;
  return selectedCommits;
}

function renderLanguageBreakdown(selection, commits) {
  const selectedCommits = selection
    ? commits.filter((d) => isCommitSelected(selection, d))
    : [];
  const container = document.getElementById('language-breakdown');
  if (selectedCommits.length === 0) { container.innerHTML = ''; return; }

  const lines = selectedCommits.flatMap((d) => d.lines);
  const breakdown = d3.rollup(lines, (v) => v.length, (d) => d.type);

  container.innerHTML = '';
  for (const [language, count] of breakdown) {
    const proportion = count / lines.length;
    const formatted = d3.format('.1~%')(proportion);
    container.innerHTML += `<dt>${language}</dt><dd>${count} lines (${formatted})</dd>`;
  }
}

// ── Initial scatter plot render ───────────────────────────────────────────────
function renderScatterPlot(data, commits) {
  const width = 1000;
  const height = 600;
  const margin = { top: 10, right: 10, bottom: 30, left: 50 };
  const usableArea = {
    top: margin.top,
    right: width - margin.right,
    bottom: height - margin.bottom,
    left: margin.left,
    width: width - margin.left - margin.right,
    height: height - margin.top - margin.bottom,
  };

  xScale = d3.scaleTime()
    .domain(d3.extent(commits, (d) => d.datetime))
    .range([usableArea.left, usableArea.right])
    .nice();

  yScale = d3.scaleLinear()
    .domain([0, 24])
    .range([usableArea.bottom, usableArea.top]);

  const svg = d3.select('#chart')
    .append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .style('overflow', 'visible');

  // Gridlines
  svg.append('g')
    .attr('class', 'gridlines')
    .attr('transform', `translate(${usableArea.left}, 0)`)
    .call(d3.axisLeft(yScale).tickFormat('').tickSize(-usableArea.width));

  // X axis
  svg.append('g')
    .attr('transform', `translate(0, ${usableArea.bottom})`)
    .attr('class', 'x-axis')
    .call(d3.axisBottom(xScale));

  // Y axis
  svg.append('g')
    .attr('transform', `translate(${usableArea.left}, 0)`)
    .attr('class', 'y-axis')
    .call(
      d3.axisLeft(yScale)
        .tickFormat((d) => String(d % 24).padStart(2, '0') + ':00')
    );

  const [minLines, maxLines] = d3.extent(commits, (d) => d.totalLines);
  const rScale = d3.scaleSqrt().domain([minLines, maxLines]).range([2, 30]);

  const sortedCommits = d3.sort(commits, (d) => -d.totalLines);
  const dots = svg.append('g').attr('class', 'dots');

  dots
    .selectAll('circle')
    .data(sortedCommits, (d) => d.id)
    .join('circle')
    .attr('cx', (d) => xScale(d.datetime))
    .attr('cy', (d) => yScale(d.hourFrac))
    .attr('r', (d) => rScale(d.totalLines))
    .attr('fill', 'steelblue')
    .style('fill-opacity', 0.7)
    .on('mouseenter', (event, commit) => {
      d3.select(event.currentTarget).style('fill-opacity', 1);
      renderTooltipContent(commit);
      updateTooltipVisibility(true);
      updateTooltipPosition(event);
    })
    .on('mouseleave', (event) => {
      d3.select(event.currentTarget).style('fill-opacity', 0.7);
      updateTooltipVisibility(false);
    });

  function brushed(event) {
    const selection = event.selection;
    d3.selectAll('circle').classed('selected', (d) => isCommitSelected(selection, d));
    renderSelectionCount(selection, commits);
    renderLanguageBreakdown(selection, commits);
  }

  svg.call(d3.brush().on('start brush end', brushed));
  svg.selectAll('.dots, .overlay ~ *').raise();
}

// ── Update scatter plot (called by slider + scrollama) ────────────────────────
function updateScatterPlot(data, commits) {
  const width = 1000;
  const height = 600;
  const margin = { top: 10, right: 10, bottom: 30, left: 50 };
  const usableArea = {
    top: margin.top,
    right: width - margin.right,
    bottom: height - margin.bottom,
    left: margin.left,
  };

  const svg = d3.select('#chart').select('svg');

  xScale = xScale.domain(d3.extent(commits, (d) => d.datetime));

  const [minLines, maxLines] = d3.extent(commits, (d) => d.totalLines);
  const rScale = d3.scaleSqrt().domain([minLines, maxLines]).range([2, 30]);

  // Update x-axis
  const xAxisGroup = svg.select('g.x-axis');
  xAxisGroup.selectAll('*').remove();
  xAxisGroup.call(d3.axisBottom(xScale));

  const dots = svg.select('g.dots');
  const sortedCommits = d3.sort(commits, (d) => -d.totalLines);

  dots
    .selectAll('circle')
    .data(sortedCommits, (d) => d.id)
    .join('circle')
    .attr('cx', (d) => xScale(d.datetime))
    .attr('cy', (d) => yScale(d.hourFrac))
    .attr('r', (d) => {
      const r = rScale(d.totalLines);
      return r;
    })
    .style('--r', (d) => rScale(d.totalLines))
    .attr('fill', 'steelblue')
    .style('fill-opacity', 0.7)
    .on('mouseenter', (event, commit) => {
      d3.select(event.currentTarget).style('fill-opacity', 1);
      renderTooltipContent(commit);
      updateTooltipVisibility(true);
      updateTooltipPosition(event);
    })
    .on('mouseleave', (event) => {
      d3.select(event.currentTarget).style('fill-opacity', 0.7);
      updateTooltipVisibility(false);
    });
}

// ── File unit visualization ───────────────────────────────────────────────────
const colors = d3.scaleOrdinal(d3.schemeTableau10);

function updateFileDisplay(filteredCommits) {
  const lines = filteredCommits.flatMap((d) => d.lines);

  const files = d3
    .groups(lines, (d) => d.file)
    .map(([name, lines]) => ({ name, lines }))
    .sort((a, b) => b.lines.length - a.lines.length);

  const filesContainer = d3
    .select('#files')
    .selectAll('div')
    .data(files, (d) => d.name)
    .join(
      (enter) =>
        enter.append('div').call((div) => {
          div.append('dt').append('code');
          div.append('dd');
        }),
    );

  filesContainer
    .select('dt > code')
    .html((d) => `${d.name} <small>${d.lines.length} lines</small>`);

  filesContainer
    .select('dd')
    .selectAll('div')
    .data((d) => d.lines)
    .join('div')
    .attr('class', 'loc')
    .attr('style', (d) => `--color: ${colors(d.type)}`);
}

// ── Time slider state ─────────────────────────────────────────────────────────
let commitProgress = 100;
let commitMaxTime;
let filteredCommits;
let timeScale;
let allData, allCommits;

function onTimeSliderChange() {
  commitProgress = Number(document.getElementById('commit-progress').value);
  commitMaxTime = timeScale.invert(commitProgress);

  document.getElementById('commit-time').textContent =
    commitMaxTime.toLocaleString('en', { dateStyle: 'long', timeStyle: 'short' });

  filteredCommits = allCommits.filter((d) => d.datetime <= commitMaxTime);

  updateScatterPlot(allData, filteredCommits);
  renderCommitInfo(allData, filteredCommits);
  updateFileDisplay(filteredCommits);
}

// ── Scrollama setup ───────────────────────────────────────────────────────────
function setupScrollama() {
  d3.select('#scatter-story')
    .selectAll('.step')
    .data(allCommits)
    .join('div')
    .attr('class', 'step')
    .html(
      (d, i) => `
        On ${d.datetime.toLocaleString('en', { dateStyle: 'full', timeStyle: 'short' })},
        I made <a href="${d.url}" target="_blank">${
          i > 0 ? 'another glorious commit' : 'my first commit, and it was glorious'
        }</a>.
        I edited ${d.totalLines} lines across ${
          d3.rollups(d.lines, (D) => D.length, (d) => d.file).length
        } files.
        Then I looked over all I had made, and I saw that it was very good.
      `,
    );

  function onStepEnter(response) {
    const stepCommit = response.element.__data__;
    commitMaxTime = stepCommit.datetime;

    // Sync slider position
    const sliderValue = timeScale(commitMaxTime);
    document.getElementById('commit-progress').value = sliderValue;
    document.getElementById('commit-time').textContent =
      commitMaxTime.toLocaleString('en', { dateStyle: 'long', timeStyle: 'short' });

    filteredCommits = allCommits.filter((d) => d.datetime <= commitMaxTime);
    updateScatterPlot(allData, filteredCommits);
    renderCommitInfo(allData, filteredCommits);
    updateFileDisplay(filteredCommits);
  }

  const scroller = scrollama();
  scroller
    .setup({
      container: '#scrolly-1',
      step: '#scrolly-1 .step',
    })
    .onStepEnter(onStepEnter);
}

// ── Entry point ───────────────────────────────────────────────────────────────
allData = await loadData();
allCommits = processCommits(allData);

timeScale = d3
  .scaleTime()
  .domain([
    d3.min(allCommits, (d) => d.datetime),
    d3.max(allCommits, (d) => d.datetime),
  ])
  .range([0, 100]);

commitMaxTime = timeScale.invert(commitProgress);
filteredCommits = allCommits;

renderCommitInfo(allData, allCommits);
renderScatterPlot(allData, allCommits);
updateFileDisplay(allCommits);

// Initialize slider display
document.getElementById('commit-time').textContent =
  commitMaxTime.toLocaleString('en', { dateStyle: 'long', timeStyle: 'short' });

document.getElementById('commit-progress')
  .addEventListener('input', onTimeSliderChange);

setupScrollama();
