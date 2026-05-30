// server/enforcement/__tests__/enforcement.test.js
// Test suite for the Schema Enforcement layer
// 4 test cases covering: all-pass, RULE-007 halt, RULE-014 auto-fix, WARN-only

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { enforce, EnforcementError } from '../SchemaEnforcer.js';

// ─────────────────────────────────────────────
// Test fixtures
// ─────────────────────────────────────────────

/** A valid Stage 1 output that passes all rules */
function makeValidStage1() {
  return {
    intent_type: 'web_app',
    domain: 'Project Management',
    primary_goal: 'Enable teams to manage projects and track tasks efficiently',
    features: [
      'Task creation and assignment',
      'Project dashboard',
      'Kanban board',
      'Deadline tracking',
      'Team collaboration',
    ],
    actors: [
      { name: 'Team Member', role: 'user', permissions: ['create_task', 'view_project'] },
      { name: 'Project Manager', role: 'admin', permissions: ['manage_project', 'assign_tasks', 'delete_project'] },
      { name: 'System', role: 'system', permissions: ['send_notifications', 'generate_reports'] },
    ],
    data_needs: ['Projects', 'Tasks', 'Users', 'Comments'],
    constraints: ['Must support real-time updates'],
    integrations: ['Email notifications'],
    non_functional: {
      scalability: 'medium',
      security: 'high',
      performance: 'high',
      availability: '99.9% uptime',
    },
  };
}

/** A valid Stage 2 output that resolves all S1 references */
function makeValidStage2() {
  return {
    app_name: 'TaskFlow',
    description: 'A project management platform for team collaboration',
    architecture_pattern: 'MVC',
    modules: [
      { name: 'UI Module', layer: 'presentation', responsibility: 'Render frontend', exposes: ['pages'], depends_on: ['API Gateway'] },
      { name: 'Task Service', layer: 'business', responsibility: 'Task management logic', exposes: ['task_api'], depends_on: ['Data Access'] },
      { name: 'Project Service', layer: 'business', responsibility: 'Project management', exposes: ['project_api'], depends_on: ['Data Access'] },
      { name: 'Data Access', layer: 'data', responsibility: 'Database operations', exposes: ['repositories'], depends_on: [] },
      { name: 'API Gateway', layer: 'infrastructure', responsibility: 'Route API requests', exposes: ['endpoints'], depends_on: ['Task Service', 'Project Service'] },
    ],
    entities: [
      { name: 'Project', description: 'A project container', attributes: [{ field: 'id', type: 'uuid', required: true, indexed: true }, { field: 'name', type: 'string', required: true, indexed: false }], relationships: [{ target: 'Task', cardinality: '1:N', label: 'has' }] },
      { name: 'Task', description: 'A work item', attributes: [{ field: 'id', type: 'uuid', required: true, indexed: true }, { field: 'title', type: 'string', required: true, indexed: false }], relationships: [{ target: 'User', cardinality: 'M:N', label: 'assigned_to' }] },
      { name: 'User', description: 'A system user', attributes: [{ field: 'id', type: 'uuid', required: true, indexed: true }, { field: 'email', type: 'string', required: true, indexed: true }], relationships: [] },
      { name: 'Comment', description: 'A comment on a task', attributes: [{ field: 'id', type: 'uuid', required: true, indexed: true }, { field: 'body', type: 'text', required: true, indexed: false }], relationships: [{ target: 'Task', cardinality: '1:1', label: 'on' }] },
    ],
    user_flows: [
      { name: 'Create Task', actors: ['Team Member'], trigger: 'User clicks new task', steps: ['Fill form', 'Assign member', 'Set deadline'], outcome: 'Task created and visible on kanban board' },
      { name: 'Manage Project Dashboard', actors: ['Project Manager'], trigger: 'Manager opens project', steps: ['View progress', 'Check deadlines', 'Review tasks'], outcome: 'Project status overview displayed' },
      { name: 'Team Collaboration', actors: ['Team Member'], trigger: 'User adds comment', steps: ['Type comment', 'Tag member', 'Submit'], outcome: 'Comment posted and notification sent' },
    ],
    roles: [
      { name: 'Team Member', level: 'standard', capabilities: ['create_task', 'comment'], restrictions: ['cannot_delete_project'] },
      { name: 'Project Manager', level: 'elevated', capabilities: ['manage_all', 'assign', 'delete'], restrictions: [] },
      { name: 'System', level: 'internal', capabilities: ['notify', 'report'], restrictions: ['no_user_actions'] },
    ],
    tech_stack: {
      frontend: 'React',
      backend: 'Node.js',
      database: 'PostgreSQL',
      cache: 'Redis',
      auth_provider: 'JWT',
      hosting: 'AWS',
    },
  };
}

/** A valid Stage 3 output that resolves all S2 references */
function makeValidStage3() {
  return {
    ui_config: {
      framework: 'React',
      pages: [
        { name: 'Dashboard', route: '/dashboard', layout: 'sidebar', components: ['TaskList', 'ProjectSummary'], data_sources: ['get-projects', 'get-tasks'], allowed_roles: ['team_member', 'project_manager'] },
        { name: 'Task Board', route: '/kanban', layout: 'full-width', components: ['KanbanBoard'], data_sources: ['get-tasks'], allowed_roles: ['team_member', 'project_manager'] },
        { name: 'Login', route: '/login', layout: 'centered', components: ['LoginForm'], data_sources: ['auth-login'], allowed_roles: [] },
        { name: 'Settings', route: '/settings', layout: 'sidebar', components: ['SettingsForm'], data_sources: ['get-users'], allowed_roles: ['project_manager'] },
      ],
      navigation: [
        { label: 'Dashboard', route: '/dashboard', icon: 'home', roles: ['team_member', 'project_manager'] },
        { label: 'Kanban', route: '/kanban', icon: 'board', roles: ['team_member'] },
      ],
      theme: {
        primary_color: '#6C5CE7',
        secondary_color: '#00CEC9',
        font: 'Inter',
        style: 'card',
      },
    },
    api_config: {
      style: 'REST',
      base_path: '/api/v1',
      versioning: 'URL prefix',
      endpoints: [
        { id: 'get-projects', method: 'GET', path: '/projects', description: 'List all projects', auth_required: true, roles: ['team_member', 'project_manager'], query_params: ['page', 'limit'], body_schema: null, response_schema: 'Project[]', rate_limit: null },
        { id: 'create-project', method: 'POST', path: '/projects', description: 'Create a new project', auth_required: true, roles: ['project_manager'], query_params: [], body_schema: 'CreateProjectDTO', response_schema: 'Project', rate_limit: '10/min' },
        { id: 'get-tasks', method: 'GET', path: '/tasks', description: 'List tasks for a project', auth_required: true, roles: ['team_member', 'project_manager'], query_params: ['project_id', 'status'], body_schema: null, response_schema: 'Task[]', rate_limit: null },
        { id: 'create-task', method: 'POST', path: '/tasks', description: 'Create a new task and assign it', auth_required: true, roles: ['team_member', 'project_manager'], query_params: [], body_schema: 'CreateTaskDTO', response_schema: 'Task', rate_limit: '20/min' },
        { id: 'update-task', method: 'PUT', path: '/tasks/:id', description: 'Update task details or deadline', auth_required: true, roles: ['team_member', 'project_manager'], query_params: [], body_schema: 'UpdateTaskDTO', response_schema: 'Task', rate_limit: null },
        { id: 'delete-task', method: 'DELETE', path: '/tasks/:id', description: 'Delete a task', auth_required: true, roles: ['project_manager'], query_params: [], body_schema: null, response_schema: 'void', rate_limit: null },
        { id: 'get-users', method: 'GET', path: '/users', description: 'List team members', auth_required: true, roles: ['project_manager'], query_params: [], body_schema: null, response_schema: 'User[]', rate_limit: null },
        { id: 'create-comment', method: 'POST', path: '/comments', description: 'Add a comment for collaboration', auth_required: true, roles: ['team_member', 'project_manager'], query_params: [], body_schema: 'CreateCommentDTO', response_schema: 'Comment', rate_limit: '30/min' },
        { id: 'get-comments', method: 'GET', path: '/comments', description: 'Get comments for a task', auth_required: true, roles: ['team_member', 'project_manager'], query_params: ['task_id'], body_schema: null, response_schema: 'Comment[]', rate_limit: null },
        { id: 'auth-login', method: 'POST', path: '/auth/login', description: 'User login', auth_required: false, roles: [], query_params: [], body_schema: 'LoginDTO', response_schema: 'AuthToken', rate_limit: '5/min' },
      ],
    },
    db_schema: {
      engine: 'PostgreSQL',
      tables: [
        {
          name: 'projects',
          columns: [
            { name: 'id', sql_type: 'UUID', nullable: false, default: 'gen_random_uuid()', pk: true, fk: null, unique: true },
            { name: 'name', sql_type: 'VARCHAR(255)', nullable: false, default: null, pk: false, fk: null, unique: false },
            { name: 'description', sql_type: 'TEXT', nullable: true, default: null, pk: false, fk: null, unique: false },
            { name: 'owner_id', sql_type: 'UUID', nullable: false, default: null, pk: false, fk: 'users.id', unique: false },
          ],
          indexes: [{ columns: ['owner_id'], unique: false }],
          foreign_keys: [{ column: 'owner_id', references: 'users.id' }],
        },
        {
          name: 'tasks',
          columns: [
            { name: 'id', sql_type: 'UUID', nullable: false, default: 'gen_random_uuid()', pk: true, fk: null, unique: true },
            { name: 'title', sql_type: 'VARCHAR(255)', nullable: false, default: null, pk: false, fk: null, unique: false },
            { name: 'status', sql_type: 'VARCHAR(50)', nullable: false, default: "'todo'", pk: false, fk: null, unique: false },
            { name: 'project_id', sql_type: 'UUID', nullable: false, default: null, pk: false, fk: 'projects.id', unique: false },
            { name: 'assignee_id', sql_type: 'UUID', nullable: true, default: null, pk: false, fk: 'users.id', unique: false },
          ],
          indexes: [{ columns: ['project_id'], unique: false }, { columns: ['assignee_id'], unique: false }],
          foreign_keys: [{ column: 'project_id', references: 'projects.id' }, { column: 'assignee_id', references: 'users.id' }],
        },
        {
          name: 'users',
          columns: [
            { name: 'id', sql_type: 'UUID', nullable: false, default: 'gen_random_uuid()', pk: true, fk: null, unique: true },
            { name: 'email', sql_type: 'VARCHAR(255)', nullable: false, default: null, pk: false, fk: null, unique: true },
            { name: 'name', sql_type: 'VARCHAR(255)', nullable: false, default: null, pk: false, fk: null, unique: false },
            { name: 'role', sql_type: 'VARCHAR(50)', nullable: false, default: "'team_member'", pk: false, fk: null, unique: false },
          ],
          indexes: [{ columns: ['email'], unique: true }],
          foreign_keys: [],
        },
        {
          name: 'comments',
          columns: [
            { name: 'id', sql_type: 'UUID', nullable: false, default: 'gen_random_uuid()', pk: true, fk: null, unique: true },
            { name: 'body', sql_type: 'TEXT', nullable: false, default: null, pk: false, fk: null, unique: false },
            { name: 'task_id', sql_type: 'UUID', nullable: false, default: null, pk: false, fk: 'tasks.id', unique: false },
            { name: 'user_id', sql_type: 'UUID', nullable: false, default: null, pk: false, fk: 'users.id', unique: false },
          ],
          indexes: [{ columns: ['task_id'], unique: false }, { columns: ['user_id'], unique: false }],
          foreign_keys: [{ column: 'task_id', references: 'tasks.id' }, { column: 'user_id', references: 'users.id' }],
        },
      ],
      migrations: ['001_create_users', '002_create_projects', '003_create_tasks', '004_create_comments'],
    },
    auth_rules: {
      mechanism: 'JWT',
      jwt_expiry: '24h',
      refresh_token: true,
      mfa_required: false,
      rules: [
        { resource: 'projects', action: 'read', roles: ['team_member', 'project_manager'], condition: null, deny_default: true },
        { resource: 'projects', action: 'create', roles: ['project_manager'], condition: null, deny_default: true },
        { resource: 'projects', action: 'delete', roles: ['project_manager'], condition: null, deny_default: true },
        { resource: 'tasks', action: 'create', roles: ['team_member', 'project_manager'], condition: null, deny_default: true },
        { resource: 'tasks', action: 'update', roles: ['team_member', 'project_manager'], condition: null, deny_default: true },
        { resource: 'tasks', action: 'delete', roles: ['project_manager'], condition: null, deny_default: true },
        { resource: 'comments', action: 'create', roles: ['team_member', 'project_manager'], condition: null, deny_default: true },
        { resource: 'users', action: 'read', roles: ['project_manager'], condition: null, deny_default: true },
        { resource: 'system', action: 'execute', roles: ['system'], condition: null, deny_default: true },
      ],
      public_routes: ['/auth/login', '/auth/register'],
      protected_routes: ['/projects', '/tasks', '/comments', '/users', '/settings'],
    },
  };
}

/** A valid Stage 4 output */
function makeValidStage4() {
  return {
    validation_report: {
      overall_status: 'PASS',
      confidence_score: 85,
      issues: [
        { id: 'info-1', severity: 'INFO', layer: 'schema', description: 'All FK constraints valid', auto_resolved: true, resolution: 'Verified' },
      ],
    },
    cross_layer_checks: [
      { check: 'Actor-Role mapping', layers_involved: ['intent', 'design'], status: 'PASS', detail: 'All 3 actors mapped to roles' },
      { check: 'Entity-Table mapping', layers_involved: ['design', 'schema'], status: 'PASS', detail: 'All 4 entities have tables' },
      { check: 'Feature-Flow mapping', layers_involved: ['intent', 'design'], status: 'PASS', detail: 'All features covered by user flows' },
    ],
    applied_refinements: [
      { id: 'ref-1', type: 'auto_add', affected_layer: 'schema', description: 'Added timestamps to all tables', before: 'No timestamps', after: 'created_at, updated_at added' },
      { id: 'ref-2', type: 'optimization', affected_layer: 'schema', description: 'Added indexes for FK columns', before: 'No FK indexes', after: 'FK indexes created' },
    ],
    final_spec: {
      project_name: 'TaskFlow',
      version: '1.0.0',
      summary: 'A project management platform for team collaboration with task tracking and kanban boards',
      complexity: 'MEDIUM',
      estimated_dev_time: '4-6 weeks',
      team_size_recommendation: '3-4 developers',
      deployment_target: 'AWS ECS',
      deployment_ready: true,
      executable_config: {
        start: 'npm start',
        build: 'npm run build',
        test: 'npm test',
        required_env_vars: ['DATABASE_URL', 'JWT_SECRET', 'PORT'],
        docker_base: 'node:20-alpine',
      },
      next_steps: [
        'Set up PostgreSQL database',
        'Initialize React frontend',
        'Implement authentication',
        'Build core API endpoints',
      ],
    },
  };
}

// ─────────────────────────────────────────────
// Test 1: All 20 rules pass cleanly
// ─────────────────────────────────────────────
describe('Schema Enforcement', () => {

  describe('Test 1: All rules pass cleanly', () => {
    it('should pass Stage 1 enforcement', () => {
      const s1 = makeValidStage1();
      const result = enforce(1, s1, {});
      assert.equal(result.passed, true);
      assert.equal(result.enforcement_result, true);
      console.log(`  ✓ Stage 1: ${result.violations_found} violations, ${result.violations_fixed} fixed, ${result.warnings_remaining} warns`);
    });

    it('should pass Stage 2 enforcement with S1 cross-layer checks', () => {
      const s1 = makeValidStage1();
      const s2 = makeValidStage2();
      const result = enforce(2, s2, { 1: s1 });
      assert.equal(result.passed, true);
      console.log(`  ✓ Stage 2: ${result.violations_found} violations, ${result.violations_fixed} fixed, ${result.warnings_remaining} warns`);
    });

    it('should pass Stage 3 enforcement with S1+S2 cross-layer checks', () => {
      const s1 = makeValidStage1();
      const s2 = makeValidStage2();
      const s3 = makeValidStage3();
      const result = enforce(3, s3, { 1: s1, 2: s2 });
      assert.equal(result.passed, true);
      console.log(`  ✓ Stage 3: ${result.violations_found} violations, ${result.violations_fixed} fixed, ${result.warnings_remaining} warns`);
    });

    it('should pass Stage 4 enforcement', () => {
      const s1 = makeValidStage1();
      const s2 = makeValidStage2();
      const s3 = makeValidStage3();
      const s4 = makeValidStage4();
      const result = enforce(4, s4, { 1: s1, 2: s2, 3: s3 });
      assert.equal(result.passed, true);
      console.log(`  ✓ Stage 4: ${result.violations_found} violations, ${result.violations_fixed} fixed, ${result.warnings_remaining} warns`);
    });
  });

  // ─────────────────────────────────────────────
  // Test 2: RULE-007 — actor with no role → HALT
  // ─────────────────────────────────────────────
  describe('Test 2: RULE-007 auto-repair (actor with no role)', () => {
    it('should inject a missing role when an actor has no matching role', () => {
      const s1 = makeValidStage1();
      // Add an actor that has no matching role in S2
      // Using "External Auditor" which has zero word overlap with existing roles
      // ("Team Member", "Project Manager", "System")
      s1.actors.push({
        name: 'External Auditor',
        role: 'guest',
        permissions: ['view_reports'],
      });

      const s2 = makeValidStage2();
      // S2 roles do NOT include anything matching "External Auditor"
      const result = enforce(2, s2, { 1: s1 });

      assert.equal(result.passed, true);
      assert.ok(result.violations_fixed > 0, 'Should repair the missing role');
      assert.ok(
        result.output.roles.some(role => role.name === 'External Auditor'),
        'Repaired output should include External Auditor role'
      );

      console.log(`  RULE-007 repaired with ${result.violations_fixed} fix(es)`);
    });
  });

  // ─────────────────────────────────────────────
  // Test 3: RULE-014 — bad FK reference
  // ─────────────────────────────────────────────
  describe('Test 3: RULE-014 (bad FK reference)', () => {
    it('should detect unresolvable FK and halt', () => {
      const s1 = makeValidStage1();
      const s2 = makeValidStage2();
      const s3 = makeValidStage3();

      // Inject a bad FK reference — points to a nonexistent table
      s3.db_schema.tables[0].columns.push({
        name: 'category_id',
        sql_type: 'UUID',
        nullable: true,
        default: null,
        pk: false,
        fk: 'categories.id',  // "categories" table doesn't exist!
        unique: false,
      });
      s3.db_schema.tables[0].foreign_keys.push({
        column: 'category_id',
        references: 'categories.id',
      });

      assert.throws(
        () => enforce(3, s3, { 1: s1, 2: s2 }),
        (err) => {
          assert.ok(err instanceof EnforcementError, 'Should be EnforcementError');
          const fkViolations = err.violations.filter(v => v.rule_id === 'RULE-014');
          assert.ok(fkViolations.length > 0, 'Should have RULE-014 violation');
          assert.ok(fkViolations[0].message.includes('categories.id'), 'Should mention the bad FK');

          console.log(`  ✓ HALT: ${err.error_count} errors`);
          console.log(`    RULE-014: ${fkViolations[0].message}`);
          return true;
        }
      );
    });
  });

  // ─────────────────────────────────────────────
  // Test 4: WARN-only — continues execution
  // ─────────────────────────────────────────────
  describe('Test 4: WARN-only violations (should continue)', () => {
    it('should pass with warnings when confidence_score is auto-fixed for WARN status', () => {
      const s1 = makeValidStage1();
      const s2 = makeValidStage2();
      const s3 = makeValidStage3();
      const s4 = makeValidStage4();

      // Set status to WARN with high confidence — should auto-fix
      s4.validation_report.overall_status = 'WARN';
      s4.validation_report.confidence_score = 85;  // Too high for WARN (max 70)
      s4.validation_report.issues.push({
        id: 'warn-1',
        severity: 'WARN',
        layer: 'schema',
        description: 'Some minor issue',
        auto_resolved: false,
        resolution: null,
      });

      const result = enforce(4, s4, { 1: s1, 2: s2, 3: s3 });
      assert.equal(result.passed, true, 'Should pass (auto-fixed)');
      assert.ok(result.violations_fixed > 0, 'Should have auto-fixed violations');

      // Verify the confidence score was clamped
      assert.ok(result.output.validation_report.confidence_score <= 70,
        `confidence_score should be ≤ 70, got ${result.output.validation_report.confidence_score}`);

      console.log(`  ✓ PASSED with ${result.violations_found} violations found, ${result.violations_fixed} fixed`);
      console.log(`    confidence_score clamped to ${result.output.validation_report.confidence_score}`);
      console.log(`    ${result.warnings_remaining} warning(s) remaining`);
      return true;
    });
  });

});
