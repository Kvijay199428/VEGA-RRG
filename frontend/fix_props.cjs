const fs = require('fs');

function replaceAll(file, replacements) {
    let text = fs.readFileSync(file, 'utf8');
    for (const [from, to] of replacements) {
        text = text.split(from).join(to);
    }
    fs.writeFileSync(file, text);
}

replaceAll('src/components/terminal/WatchlistPanel.tsx', [
    ['item.sector', 'item.symbol']
]);

replaceAll('src/components/RankingPanel.tsx', [
    ["'sector' | 'rsRatio' | 'rsMomentum' | 'rank'", "'symbol' | 'x' | 'y' | 'rank'"],
    ["useState<SortKey>('rsRatio')", "useState<SortKey>('x')"],
    ["a.strength || a.rsRatio || 0", "a.trendStrength || a.x || 0"],
    ["b.strength || b.rsRatio || 0", "b.trendStrength || b.x || 0"],
    ["handleSort('sector')", "handleSort('symbol')"],
    ["renderSortArrow('sector')", "renderSortArrow('symbol')"],
    ["handleSort('rsRatio')", "handleSort('x')"],
    ["renderSortArrow('rsRatio')", "renderSortArrow('x')"],
    ["handleSort('rsMomentum')", "handleSort('y')"],
    ["renderSortArrow('rsMomentum')", "renderSortArrow('y')"],
    ["item.sector", "item.symbol"],
    ["item.rsRatio", "item.x"],
    ["item.rsMomentum", "item.y"],
    ["selectedSector === item.symbol", "selectedSector === item.symbol"]
]);
console.log("Fixed sector vs symbol property names");
