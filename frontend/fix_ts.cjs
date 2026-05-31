const fs = require('fs');
const path = require('path');

function replaceInFile(filePath, replacements) {
    let content = fs.readFileSync(filePath, 'utf8');
    for (const { from, to } of replacements) {
        content = content.replace(from, to);
    }
    fs.writeFileSync(filePath, content, 'utf8');
}

// 1. App.tsx
replaceInFile('src/App.tsx', [
    { from: /import React from 'react';\r?\n/, to: '' },
    { from: /import { CommandBar }/g, to: "import CommandBar" },
    { from: /import { WatchlistPanel }/g, to: "import WatchlistPanel" },
    { from: /import { StatusBar }/g, to: "import StatusBar" },
    { from: /import { MetricsPanel }/g, to: "import MetricsPanel" },
    { from: /import { RankingPanel }/g, to: "import RankingPanel" }
]);

// 2. Layers (type imports)
const layerFiles = fs.readdirSync('src/components/chart/layers').filter(f => f.endsWith('.tsx'));
for (const file of layerFiles) {
    const filePath = path.join('src/components/chart/layers', file);
    replaceInFile(filePath, [
        { from: /import \{\s*([^}]*?(?:RrgScales|ChartDimensions|EnrichedRrgPoint)[^}]*?)\s*\}/g, to: "import type { $1 }" },
        { from: /import React, \{([^}]*?)\} from 'react';/g, to: "import React, { $1 } from 'react';" }
    ]);
    
    let content = fs.readFileSync(filePath, 'utf8');
    content = content.replace(/import {([^}]*)} from '([^']*(?:\.\.\/)+types)';/g, "import type {$1} from '$2';");
    content = content.replace(/import {([^}]*)} from '([^']*(?:\.\.\/)+core\/scales)';/g, (match, p1, p2) => {
        if (p1.includes('RrgScales')) {
            const types = p1.split(',').map(s => s.trim());
            const typeNames = types.filter(t => t === 'RrgScales' || t === 'ChartDimensions');
            const otherNames = types.filter(t => t !== 'RrgScales' && t !== 'ChartDimensions');
            if (otherNames.length > 0) {
                return `import type { ${typeNames.join(', ')} } from '${p2}';\nimport { ${otherNames.join(', ')} } from '${p2}';`;
            } else {
                return `import type { ${typeNames.join(', ')} } from '${p2}';`;
            }
        }
        return match;
    });
    fs.writeFileSync(filePath, content, 'utf8');
}

// Additional fix for RrgScene
replaceInFile('src/components/chart/RrgScene.tsx', [
    { from: /import {([^}]*)} from '([^']*(?:\.\.\/)+types)';/g, to: "import type {$1} from '$2';" }
]);

// 3. MetricsPanel
replaceInFile('src/components/MetricsPanel.tsx', [
    { from: /\.sector/g, to: '.symbol' },
    { from: /\.rsRatio/g, to: '.x' },
    { from: /\.rsMomentum/g, to: '.y' },
    { from: /\.momRoc/g, to: '.momentumRoc' },
    { from: /\.strength/g, to: '.trendStrength' }
]);

// 4. StatusBar
replaceInFile('src/components/terminal/StatusBar.tsx', [
    { from: /\.LEADING/g, to: '.leading' },
    { from: /\.WEAKENING/g, to: '.weakening' },
    { from: /\.LAGGING/g, to: '.lagging' },
    { from: /\.IMPROVING/g, to: '.improving' }
]);

// 5. geometry.ts
replaceInFile('src/core/geometry.ts', [
    { from: /import \{ LabelRect \} from '\.\.\/types';\r?\n/g, to: '' },
    { from: /export function resolveCollisions/g, to: "export interface LabelRect { id: string; x: number; y: number; width: number; height: number; anchorX: number; anchorY: number; }\n\nexport function resolveCollisions" }
]);

// 6. math.ts
replaceInFile('src/core/math.ts', [
    { from: /QuadrantDistribution, Quadrant/g, to: 'QuadrantDistribution' }
]);

// 7. api.ts
replaceInFile('src/services/api.ts', [
    { from: /const latency = Math\.round\(performance\.now\(\) - start\);\r?\n\s*return response\.data;/g, to: "return response.data;" }
]);

// Fix the unused useMemo in TrailLayer
replaceInFile('src/components/chart/layers/TrailLayer.tsx', [
    { from: /import React, \{([^}]*)useMemo([^}]*)\} from 'react';/, to: (match, p1, p2) => {
        let inside = `${p1}${p2}`.replace(/,\s*,/g, ',').replace(/^,\s*/, '').replace(/,\s*$/, '').trim();
        if (inside) return `import React, { ${inside} } from 'react';`;
        return `import React from 'react';`;
    }}
]);

console.log("Fixes applied.");
