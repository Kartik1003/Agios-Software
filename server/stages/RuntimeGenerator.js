// server/stages/RuntimeGenerator.js
// Stage 5 — Runtime Generation
// Takes the final compiled spec and generates a working application scaffold.

import { saveArtifact } from '../data/PersistentSessionStore.js';

const STAGE_NUMBER = 5;
const STAGE_NAME = 'Runtime Generation';

export async function execute(rawInput, stageOutputs, sessionId) {
  try {
    const finalSpec = stageOutputs[4];
    if (!finalSpec) {
      return { success: false, error: new Error('Missing Stage 4 output') };
    }

    const { ui_config, api_config, db_schema, auth_rules } = stageOutputs[3];

    // Generate Frontend (Pages + Routes)
    if (ui_config && ui_config.pages) {
      for (const page of ui_config.pages) {
        const pageName = page.name.replace(/\s+/g, '');
        const content = generateReactPage(page);
        await saveArtifact(sessionId, `frontend/pages/${pageName}.jsx`, content);
      }
      
      const routesContent = generateReactRoutes(ui_config.pages);
      await saveArtifact(sessionId, 'frontend/App.jsx', routesContent);
      
      // Save theme config
      if (ui_config.theme) {
        await saveArtifact(sessionId, 'frontend/theme.json', JSON.stringify(ui_config.theme, null, 2));
      }
    }

    // Generate Backend (Routes + Controllers)
    if (api_config && api_config.endpoints) {
      const routesMap = new Map();
      for (const ep of api_config.endpoints) {
        const resource = ep.path.split('/')[2] || 'core';
        if (!routesMap.has(resource)) routesMap.set(resource, []);
        routesMap.get(resource).push(ep);
      }
      
      for (const [resource, endpoints] of routesMap.entries()) {
        const routeContent = generateExpressRoute(resource, endpoints);
        await saveArtifact(sessionId, `backend/routes/${resource}.js`, routeContent);
        
        const controllerContent = generateExpressController(resource, endpoints);
        await saveArtifact(sessionId, `backend/controllers/${resource}Controller.js`, controllerContent);
      }
    }

    // Generate Database (SQL Schema)
    if (db_schema && db_schema.tables) {
      const sqlContent = generateSqlSchema(db_schema.tables);
      await saveArtifact(sessionId, `database/schema.sql`, sqlContent);
    }

    // Generate Auth config
    if (auth_rules) {
      await saveArtifact(sessionId, `auth/roles.json`, JSON.stringify(auth_rules, null, 2));
    }

    return { 
      success: true, 
      data: {
        message: 'Runtime artifacts generated successfully',
        artifacts_path: `generated-apps/${sessionId}/`
      } 
    };

  } catch (err) {
    return {
      success: false,
      error: { message: err.message, compiler_error: true }
    };
  }
}

export const stageInfo = {
  number: STAGE_NUMBER,
  name: STAGE_NAME,
  execute,
};

// ─────────────────────────────────────────────
// Generators
// ─────────────────────────────────────────────

function generateReactPage(page) {
  const compName = page.name.replace(/\s+/g, '');
  return `import React, { useState, useEffect } from 'react';

// ${page.name}
// Description: ${page.description}
// Allowed Roles: ${(page.allowed_roles || []).join(', ')}

export default function ${compName}() {
  const [data, setData] = useState(null);

  useEffect(() => {
    // Fetch data for sources: ${(page.data_sources || []).join(', ')}
  }, []);

  return (
    <div className="${compName.toLowerCase()}-container">
      <h1>${page.name}</h1>
      <p>${page.description}</p>
      {/* Generated Components: ${(page.components || []).join(', ')} */}
    </div>
  );
}
`;
}

function generateReactRoutes(pages) {
  return `import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

${pages.map(p => `import ${p.name.replace(/\s+/g, '')} from './pages/${p.name.replace(/\s+/g, '')}';`).join('\n')}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
${pages.map(p => `        <Route path="${p.route || '/' + p.name.toLowerCase().replace(/\s+/g, '-')}" element={<${p.name.replace(/\s+/g, '')} />} />`).join('\n')}
      </Routes>
    </BrowserRouter>
  );
}
`;
}

function generateExpressRoute(resource, endpoints) {
  return `const express = require('express');
const router = express.Router();
const controller = require('../controllers/${resource}Controller');

${endpoints.map(ep => `// ${ep.description}\nrouter.${ep.method.toLowerCase()}('${ep.path}', controller.${ep.id});`).join('\n\n')}

module.exports = router;
`;
}

function generateExpressController(resource, endpoints) {
  return `// ${resource} Controller

${endpoints.map(ep => `exports.${ep.id} = async (req, res) => {
  try {
    // Requires roles: ${(ep.roles || []).join(', ')}
    res.status(200).json({ message: '${ep.id} executed successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};`).join('\n\n')}
`;
}

function generateSqlSchema(tables) {
  let sql = '-- Auto-generated SQL Schema\n\n';

  for (const table of tables) {
    sql += `CREATE TABLE ${table.name} (\n`;
    
    const cols = table.columns.map(c => {
      let def = `  ${c.name} ${c.sql_type}`;
      if (!c.nullable) def += ' NOT NULL';
      if (c.default) def += ` DEFAULT ${c.default}`;
      if (c.pk) def += ' PRIMARY KEY';
      if (c.unique) def += ' UNIQUE';
      return def;
    });
    
    sql += cols.join(',\n') + '\n);\n\n';
  }

  return sql;
}
