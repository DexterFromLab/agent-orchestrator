<script lang="ts">
  interface Props {
    content: string;
    filename: string;
  }

  let { content, filename }: Props = $props();

  /** Parse CSV with basic RFC 4180 quoting support */
  function parseCsv(text: string): string[][] {
    const rows: string[][] = [];
    let i = 0;
    const len = text.length;

    while (i < len) {
      const row: string[] = [];
      while (i < len) {
        let field = '';
        if (text[i] === '"') {
          // Quoted field
          i++; // skip opening quote
          while (i < len) {
            if (text[i] === '"') {
              if (i + 1 < len && text[i + 1] === '"') {
                field += '"';
                i += 2;
              } else {
                i++; // skip closing quote
                break;
              }
            } else {
              field += text[i];
              i++;
            }
          }
        } else {
          // Unquoted field
          while (i < len && text[i] !== ',' && text[i] !== '\n' && text[i] !== '\r') {
            field += text[i];
            i++;
          }
        }
        row.push(field);

        if (i < len && text[i] === ',') {
          i++; // skip comma, continue row
        } else {
          // End of row
          if (i < len && text[i] === '\r') i++;
          if (i < len && text[i] === '\n') i++;
          break;
        }
      }
      // Skip empty trailing rows
      if (row.length > 0 && !(row.length === 1 && row[0] === '')) {
        rows.push(row);
      }
    }
    return rows;
  }

  /** Detect delimiter: comma vs semicolon vs tab */
  function detectDelimiter(text: string): string {
    const firstLine = text.split('\n')[0] ?? '';
    const commas = (firstLine.match(/,/g) ?? []).length;
    const semicolons = (firstLine.match(/;/g) ?? []).length;
    const tabs = (firstLine.match(/\t/g) ?? []).length;
    if (tabs > commas && tabs > semicolons) return '\t';
    if (semicolons > commas) return ';';
    return ',';
  }

  let parsed = $derived.by(() => {
    // Normalize delimiter to comma before parsing
    const delim = detectDelimiter(content);
    const normalized = delim === ',' ? content : content.replaceAll(delim, ',');
    return parseCsv(normalized);
  });

  let headers = $derived(parsed[0] ?? []);
  let dataRows = $derived(parsed.slice(1));
  let totalRows = $derived(dataRows.length);

  // Column count from widest row
  let colCount = $derived(Math.max(...parsed.map(r => r.length), 0));

  // Sort state
  let sortCol = $state<number | null>(null);
  let sortAsc = $state(true);

  let sortedRows = $derived.by(() => {
    if (sortCol === null) return dataRows;
    const col = sortCol;
    const asc = sortAsc;
    return [...dataRows].sort((a, b) => {
      const va = a[col] ?? '';
      const vb = b[col] ?? '';
      // Try numeric comparison
      const na = Number(va);
      const nb = Number(vb);
      if (!isNaN(na) && !isNaN(nb)) {
        return asc ? na - nb : nb - na;
      }
      return asc ? va.localeCompare(vb) : vb.localeCompare(va);
    });
  });

  function toggleSort(col: number) {
    if (sortCol === col) {
      sortAsc = !sortAsc;
    } else {
      sortCol = col;
      sortAsc = true;
    }
  }

  function sortIndicator(col: number): string {
    if (sortCol !== col) return '';
    return sortAsc ? ' ▲' : ' ▼';
  }
</script>

<div class="csv-table-wrapper">
  <div class="csv-toolbar">
    <span class="csv-info">
      {totalRows} row{totalRows !== 1 ? 's' : ''} × {colCount} col{colCount !== 1 ? 's' : ''}
    </span>
    <span class="csv-filename">{filename}</span>
  </div>

  <div class="csv-scroll">
    <table class="csv-table">
      <thead>
        <tr>
          <th class="row-num">#</th>
          {#each headers as header, i}
            <th onclick={() => toggleSort(i)} class="sortable">
              {header}{sortIndicator(i)}
            </th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each sortedRows as row, rowIdx (rowIdx)}
          <tr>
            <td class="row-num">{rowIdx + 1}</td>
            {#each { length: colCount } as _, colIdx}
              <td>{row[colIdx] ?? ''}</td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>

<style>
  .csv-table-wrapper {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
    background: var(--ctp-base);
  }

  .csv-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.25rem 0.625rem;
    background: var(--ctp-mantle);
    border-bottom: 1px solid var(--ctp-surface0);
    flex-shrink: 0;
  }

  .csv-info {
    font-size: 0.7rem;
    color: var(--ctp-overlay1);
    font-variant-numeric: tabular-nums;
  }

  .csv-filename {
    font-size: 0.65rem;
    color: var(--ctp-overlay0);
    font-family: var(--term-font-family, monospace);
  }

  .csv-scroll {
    flex: 1;
    overflow: auto;
  }

  .csv-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.725rem;
    font-family: var(--term-font-family, monospace);
    white-space: nowrap;
  }

  .csv-table thead {
    position: sticky;
    top: 0;
    z-index: 1;
  }

  .csv-table th {
    background: var(--ctp-mantle);
    color: var(--ctp-subtext1);
    font-weight: 600;
    text-align: left;
    padding: 0.3125rem 0.5rem;
    border-bottom: 1px solid var(--ctp-surface1);
    user-select: none;
  }

  .csv-table th.sortable {
    cursor: pointer;
    transition: background 0.12s;
  }

  .csv-table th.sortable:hover {
    background: var(--ctp-surface0);
    color: var(--ctp-text);
  }

  .csv-table td {
    padding: 0.25rem 0.5rem;
    border-bottom: 1px solid var(--ctp-surface0);
    color: var(--ctp-text);
    max-width: 20rem;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .csv-table tbody tr:hover td {
    background: color-mix(in srgb, var(--ctp-surface0) 50%, transparent);
  }

  .row-num {
    color: var(--ctp-overlay0);
    font-size: 0.625rem;
    text-align: right;
    width: 2.5rem;
    min-width: 2.5rem;
    padding-right: 0.625rem;
    border-right: 1px solid var(--ctp-surface0);
  }

  thead .row-num {
    border-bottom: 1px solid var(--ctp-surface1);
  }
</style>
