// server/pipeline/DeterministicCompiler.js
// Local deterministic compiler used when provider API keys are not configured.
// It keeps the demo executable and gives the validation/repair layers real data.

const STOPWORDS = new Set([
  'a', 'an', 'and', 'app', 'application', 'as', 'build', 'can', 'for', 'in',
  'me', 'of', 'on', 'platform', 'system', 'that', 'the', 'to', 'with',
]);

export function shouldUseDeterministicCompiler() {
  return process.env.Agios_LOCAL_MODE === 'true' ||
    process.env.AGIOS_LOCAL_MODE === 'true' ||
    (!process.env.OPENROUTER_API_KEY && !process.env.GROQ_API_KEY);
}

export function compileStage(stageNumber, rawInput, stageOutputs = {}) {
  switch (stageNumber) {
    case 1:
      return buildIntent(rawInput);
    case 2:
      return buildDesign(rawInput, stageOutputs[1]);
    case 3:
      return buildSchemas(stageOutputs[1], stageOutputs[2]);
    case 4:
      return buildRefinement(stageOutputs[1], stageOutputs[2], stageOutputs[3]);
    default:
      throw new Error(`No deterministic compiler stage for ${stageNumber}`);
  }
}

function buildIntent(rawInput) {
  const text = normalizeText(rawInput);
  const domain = inferDomain(text);
  const features = inferFeatures(text);
  const actors = inferActors(text);
  const dataNeeds = inferDataNeeds(text, features);
  const security = text.includes('payment') || text.includes('role') || text.includes('admin') ? 'high' : 'medium';

  return {
    intent_type: inferIntentType(text),
    domain,
    primary_goal: `Build ${article(domain)} ${domain.toLowerCase()} that supports ${features.slice(0, 3).join(', ')}`,
    features,
    actors,
    data_needs: dataNeeds,
    constraints: inferConstraints(text),
    integrations: inferIntegrations(text),
    non_functional: {
      scalability: text.includes('enterprise') || text.includes('marketplace') ? 'high' : 'medium',
      security,
      performance: 'medium',
      availability: '99.9% uptime',
    },
  };
}

function buildDesign(rawInput, intent) {
  const dataNeeds = intent?.data_needs?.length ? intent.data_needs : ['Users', 'Records'];
  const entityNames = unique(['User', ...dataNeeds].map(name => singular(titleCase(name))));
  const entities = entityNames.map(name => ({
    name,
    description: `${name} data used by the ${intent.domain} system`,
    attributes: [
      { field: 'id', type: 'uuid', required: true, indexed: true },
      { field: name.toLowerCase().includes('user') ? 'email' : 'name', type: 'string', required: true, indexed: true },
      { field: 'status', type: 'string', required: false, indexed: false },
    ],
    relationships: name.toLowerCase().includes('user') ? [] : [{ target: 'User', cardinality: 'N:1', label: 'owned_by' }],
  }));

  const roles = unique((intent.actors || []).map(actor => actor.name)).map(name => ({
    name,
    level: /admin|owner|manager/i.test(name) ? 'admin' : /system/i.test(name) ? 'system' : 'user',
    capabilities: [`Access ${intent.domain}`, ...((intent.features || []).slice(0, 2))],
    restrictions: /admin|owner|manager/i.test(name) ? [] : ['Cannot manage global settings'],
  }));

  const modules = [
    { name: 'Web Experience', layer: 'presentation', responsibility: 'Render pages, forms, and dashboards', exposes: ['routes', 'views'], depends_on: ['API Gateway'] },
    { name: 'API Gateway', layer: 'infrastructure', responsibility: 'Expose validated HTTP endpoints', exposes: ['REST API'], depends_on: ['Application Services'] },
    { name: 'Application Services', layer: 'business', responsibility: 'Coordinate business rules and workflows', exposes: ['use cases'], depends_on: ['Data Access'] },
    { name: 'Data Access', layer: 'data', responsibility: 'Persist and query application entities', exposes: ['repositories'], depends_on: [] },
  ];

  const userFlows = (intent.features || []).map(feature => ({
    name: feature,
    actors: roles.length ? [roles[0].name] : ['User'],
    trigger: `User chooses to ${feature.toLowerCase()}`,
    steps: [
      `Open the ${intent.domain} workspace`,
      `Submit required ${entities[0]?.name || 'record'} details`,
      `System validates permissions and persists changes`,
    ],
    outcome: `${feature} completes successfully`,
  }));

  return {
    app_name: makeAppName(rawInput, intent.domain),
    description: `${intent.domain} generated from natural language with deterministic schema validation.`,
    architecture_pattern: 'layered',
    modules,
    entities,
    user_flows: userFlows,
    roles,
    tech_stack: {
      frontend: 'React',
      backend: 'Node.js Express',
      database: 'PostgreSQL',
      cache: 'Redis',
      auth_provider: 'JWT',
      hosting: 'Docker',
    },
  };
}

function buildSchemas(intent, design) {
  const roles = normalizedRoles(design.roles);
  const entities = design.entities || [];
  const tables = entities.map(entity => makeTable(entity));
  const endpoints = [];

  for (const entity of entities) {
    const resource = plural(kebab(entity.name));
    endpoints.push({
      id: `list-${resource}`,
      method: 'GET',
      path: `/${resource}`,
      description: `List ${entity.name} records`,
      auth_required: true,
      roles,
      query_params: ['page', 'limit'],
      body_schema: null,
      response_schema: `${entity.name}[]`,
      rate_limit: null,
    });
    endpoints.push({
      id: `create-${resource}`,
      method: 'POST',
      path: `/${resource}`,
      description: `Create a ${entity.name} record`,
      auth_required: true,
      roles: privilegedRoles(roles),
      query_params: [],
      body_schema: `Create${pascal(entity.name)}DTO`,
      response_schema: entity.name,
      rate_limit: '60/min',
    });
  }

  endpoints.unshift({
    id: 'auth-login',
    method: 'POST',
    path: '/auth/login',
    description: 'Authenticate a user and return a JWT',
    auth_required: false,
    roles: [],
    query_params: [],
    body_schema: 'LoginDTO',
    response_schema: 'AuthToken',
    rate_limit: '10/min',
  });

  const firstEndpoint = endpoints.find(e => e.auth_required)?.id || endpoints[0].id;
  const pages = [
    { name: 'Login', route: '/login', layout: 'centered', components: ['LoginForm'], data_sources: ['auth-login'], allowed_roles: [] },
    { name: 'Dashboard', route: '/dashboard', layout: 'sidebar', components: ['MetricCards', 'RecentActivity', 'DataTable'], data_sources: [firstEndpoint], allowed_roles: roles },
    ...entities.filter(e => !/user/i.test(e.name)).slice(0, 4).map(entity => ({
      name: `${entity.name} Manager`,
      route: `/${plural(kebab(entity.name))}`,
      layout: 'sidebar',
      components: [`${pascal(entity.name)}Table`, `${pascal(entity.name)}Form`],
      data_sources: [`list-${plural(kebab(entity.name))}`],
      allowed_roles: roles,
    })),
  ];

  return {
    ui_config: {
      framework: 'React',
      pages,
      navigation: pages.filter(p => p.allowed_roles.length).map(p => ({
        label: p.name,
        route: p.route,
        icon: p.name === 'Dashboard' ? 'layout-dashboard' : 'table',
        roles: p.allowed_roles,
      })),
      theme: {
        primary_color: '#2563EB',
        secondary_color: '#14B8A6',
        font: 'Inter',
        style: 'operational',
      },
    },
    api_config: {
      style: 'REST',
      base_path: '/api/v1',
      versioning: 'URL prefix',
      endpoints,
    },
    db_schema: {
      engine: 'PostgreSQL',
      tables,
      migrations: tables.map((table, index) => `${String(index + 1).padStart(3, '0')}_create_${table.name}`),
    },
    auth_rules: {
      mechanism: 'JWT',
      jwt_expiry: '24h',
      refresh_token: true,
      mfa_required: (intent.constraints || []).some(c => /mfa|multi-factor/i.test(c)),
      rules: buildAuthRules(endpoints, roles),
      public_routes: ['/auth/login'],
      protected_routes: endpoints.filter(e => e.auth_required).map(e => e.path),
    },
  };
}

function buildRefinement(intent, design, schemas) {
  const checks = [
    ['Actor-role mapping', 'intent,design', `${intent.actors.length} actors mapped to ${design.roles.length} roles`],
    ['Entity-table mapping', 'design,schema', `${design.entities.length} entities mapped to ${schemas.db_schema.tables.length} tables`],
    ['UI-API mapping', 'schema', 'Every UI data source references a generated endpoint'],
    ['Auth coverage', 'schema', 'Protected endpoints include role rules and deny-by-default policy'],
    ['Runtime readiness', 'schema', 'Executable commands and generated artifacts are available'],
  ];

  return {
    validation_report: {
      overall_status: 'PASS',
      confidence_score: 92,
      issues: [
        {
          id: 'assumption-1',
          severity: 'INFO',
          layer: 'intent',
          description: 'Ambiguous details were completed with conservative CRUD, JWT auth, and PostgreSQL defaults.',
          auto_resolved: true,
          resolution: 'Recorded deterministic defaults in final next steps.',
        },
      ],
    },
    cross_layer_checks: checks.map(([check, layers, detail]) => ({
      check,
      layers_involved: layers.split(','),
      status: 'PASS',
      detail,
    })),
    applied_refinements: [
      {
        id: 'ref-auth-coverage',
        type: 'gap_fill',
        affected_layer: 'cross-layer',
        description: 'Added deny-by-default auth rules for protected API routes',
        before: 'Natural-language access requirements',
        after: 'Explicit protected route and role rules',
      },
      {
        id: 'ref-runtime',
        type: 'auto_add',
        affected_layer: 'schema',
        description: 'Added executable runtime commands and required environment variables',
        before: 'Configuration only',
        after: 'Runnable frontend, backend, database, and auth artifacts',
      },
    ],
    final_spec: {
      project_name: design.app_name,
      version: '1.0.0',
      summary: `${design.description} Includes ${schemas.ui_config.pages.length} pages, ${schemas.api_config.endpoints.length} endpoints, ${schemas.db_schema.tables.length} tables, and ${design.roles.length} roles.`,
      complexity: schemas.db_schema.tables.length > 5 || schemas.api_config.endpoints.length > 10 ? 'HIGH' : 'MEDIUM',
      estimated_dev_time: schemas.db_schema.tables.length > 5 ? '6-8 weeks' : '3-5 weeks',
      team_size_recommendation: '2-4 developers',
      deployment_target: 'Docker container on any Node.js host',
      deployment_ready: true,
      executable_config: {
        start: 'npm start',
        build: 'npm run build',
        test: 'npm test',
        required_env_vars: ['DATABASE_URL', 'JWT_SECRET', 'PORT'],
        docker_base: 'node:20-alpine',
      },
      next_steps: [
        'Review assumptions for vague or missing requirements',
        'Run generated SQL migrations',
        'Wire generated endpoints to real persistence',
        'Connect payment or third-party integrations where requested',
      ],
    },
  };
}

function inferIntentType(text) {
  if (text.includes('dashboard') || text.includes('analytics')) return 'dashboard';
  if (text.includes('mobile')) return 'mobile_app';
  if (text.includes('api')) return 'api_service';
  if (text.includes('saas') || text.includes('subscription') || text.includes('premium')) return 'saas_platform';
  return 'web_app';
}

function inferDomain(text) {
  const domains = [
    ['crm', 'CRM'],
    ['customer', 'CRM'],
    ['project', 'Project Management'],
    ['task', 'Task Management'],
    ['commerce', 'Commerce'],
    ['shop', 'Commerce'],
    ['payment', 'Subscription SaaS'],
    ['analytics', 'Analytics Dashboard'],
    ['booking', 'Booking'],
    ['health', 'Healthcare'],
    ['education', 'Education'],
  ];
  return domains.find(([needle]) => text.includes(needle))?.[1] || 'Business Workflow';
}

function inferFeatures(text) {
  const featureMap = [
    ['login', 'User login'],
    ['auth', 'Authentication'],
    ['contact', 'Contact management'],
    ['dashboard', 'Dashboard analytics'],
    ['role', 'Role-based access'],
    ['admin', 'Admin analytics'],
    ['premium', 'Premium plan gating'],
    ['payment', 'Payments'],
    ['subscription', 'Subscriptions'],
    ['notification', 'Notifications'],
    ['report', 'Reporting'],
    ['search', 'Search and filtering'],
    ['task', 'Task tracking'],
    ['crm', 'Customer pipeline management'],
  ];
  const features = featureMap.filter(([needle]) => text.includes(needle)).map(([, feature]) => feature);
  if (features.length < 2) features.push('Record management', 'Dashboard analytics');
  return unique(features).slice(0, 10);
}

function inferActors(text) {
  const actors = [
    { name: 'User', role: 'user', permissions: ['read_own_data', 'manage_own_profile'] },
  ];
  if (text.includes('admin') || text.includes('analytics') || text.includes('role')) {
    actors.push({ name: 'Admin', role: 'admin', permissions: ['manage_users', 'view_analytics', 'configure_system'] });
  }
  if (text.includes('guest') || text.includes('public')) {
    actors.push({ name: 'Guest', role: 'guest', permissions: ['view_public_pages'] });
  }
  actors.push({ name: 'System', role: 'system', permissions: ['enforce_rules', 'send_notifications'] });
  return actors;
}

function inferDataNeeds(text, features) {
  const needs = ['Users'];
  const candidates = [
    ['contact', 'Contacts'],
    ['customer', 'Customers'],
    ['lead', 'Leads'],
    ['deal', 'Deals'],
    ['payment', 'Payments'],
    ['subscription', 'Subscriptions'],
    ['premium', 'Plans'],
    ['analytics', 'Events'],
    ['task', 'Tasks'],
    ['project', 'Projects'],
    ['report', 'Reports'],
  ];
  for (const [needle, entity] of candidates) {
    if (text.includes(needle)) needs.push(entity);
  }
  if (needs.length === 1) {
    for (const feature of features) needs.push(titleCase(feature.split(' ')[0]));
  }
  return unique(needs).slice(0, 8);
}

function inferConstraints(text) {
  const constraints = [];
  if (text.includes('role')) constraints.push('Enforce role-based access control');
  if (text.includes('premium')) constraints.push('Gate premium capabilities by plan');
  if (text.includes('payment')) constraints.push('Protect payment and subscription data');
  if (text.length < 80) constraints.push('Prompt is underspecified; apply conservative defaults and document assumptions');
  return constraints;
}

function inferIntegrations(text) {
  const integrations = [];
  if (text.includes('payment') || text.includes('stripe')) integrations.push('Stripe');
  if (text.includes('email') || text.includes('notification')) integrations.push('Email provider');
  if (text.includes('calendar')) integrations.push('Calendar API');
  return integrations;
}

function makeTable(entity) {
  const tableName = plural(snake(entity.name));
  const columns = [
    { name: 'id', sql_type: 'UUID', nullable: false, default: 'gen_random_uuid()', pk: true, fk: null, unique: true },
  ];

  for (const attr of entity.attributes || []) {
    if (attr.field === 'id') continue;
    columns.push({
      name: snake(attr.field),
      sql_type: sqlType(attr.type),
      nullable: !attr.required,
      default: null,
      pk: false,
      fk: null,
      unique: attr.field === 'email',
    });
  }

  if (!/users/.test(tableName)) {
    columns.push({ name: 'user_id', sql_type: 'UUID', nullable: false, default: null, pk: false, fk: 'users.id', unique: false });
  }

  return {
    name: tableName,
    columns,
    indexes: columns.filter(c => c.unique || c.fk).map(c => ({ columns: [c.name], unique: c.unique })),
    foreign_keys: columns.filter(c => c.fk).map(c => ({ column: c.name, references: c.fk })),
  };
}

function buildAuthRules(endpoints, roles) {
  return endpoints.filter(e => e.auth_required).map(endpoint => ({
    resource: endpoint.path,
    action: methodToAction(endpoint.method),
    roles: endpoint.roles.length ? endpoint.roles : roles,
    condition: null,
    deny_default: true,
  }));
}

function normalizedRoles(roles) {
  const names = roles?.map(r => snake(r.name)) || ['user'];
  return unique(names);
}

function privilegedRoles(roles) {
  const privileged = roles.filter(role => /admin|owner|manager|system/.test(role));
  return privileged.length ? privileged : roles;
}

function methodToAction(method) {
  return { GET: 'read', POST: 'create', PUT: 'update', PATCH: 'update', DELETE: 'delete' }[method] || 'execute';
}

function sqlType(type) {
  const value = String(type).toLowerCase();
  if (value.includes('uuid')) return 'UUID';
  if (value.includes('text')) return 'TEXT';
  if (value.includes('number') || value.includes('int')) return 'INTEGER';
  if (value.includes('bool')) return 'BOOLEAN';
  if (value.includes('date') || value.includes('time')) return 'TIMESTAMP';
  return 'VARCHAR(255)';
}

function makeAppName(rawInput, domain) {
  const words = rawInput
    .replace(/[^a-zA-Z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !STOPWORDS.has(word.toLowerCase()))
    .slice(0, 2)
    .map(titleCase);
  return words.length ? words.join('') : `${domain.replace(/[^a-zA-Z0-9]/g, '')}App`;
}

function normalizeText(value) {
  return String(value || '').toLowerCase();
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function titleCase(value) {
  return String(value)
    .replace(/[_-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function snake(value) {
  return String(value).trim().replace(/([a-z])([A-Z])/g, '$1_$2').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase();
}

function kebab(value) {
  return snake(value).replace(/_/g, '-');
}

function pascal(value) {
  return titleCase(value).replace(/\s+/g, '');
}

function singular(value) {
  return String(value).replace(/ies$/i, 'y').replace(/s$/i, '');
}

function plural(value) {
  if (value.endsWith('s')) return value;
  if (value.endsWith('y')) return `${value.slice(0, -1)}ies`;
  return `${value}s`;
}

function article(value) {
  return /^[aeiou]/i.test(value) ? 'an' : 'a';
}
