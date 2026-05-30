// server/evaluation/prompts.js
// Evaluation dataset: 10 realistic product prompts + 10 edge cases.

export const productPrompts = [
  'Build a CRM with login, contacts, dashboard, role-based access, and premium plan with payments. Admins can see analytics.',
  'Create a project management app with tasks, kanban board, comments, deadlines, notifications, and manager reports.',
  'Build a booking platform for salons with customer accounts, staff calendars, services, payments, and admin settings.',
  'Create an ecommerce admin dashboard with products, orders, customers, discounts, inventory alerts, and analytics.',
  'Build a learning management system with courses, lessons, quizzes, student progress, certificates, and teacher roles.',
  'Create a healthcare appointment portal with patient profiles, doctor schedules, prescriptions, billing, and secure notes.',
  'Build an event ticketing SaaS with organizers, venues, ticket tiers, checkout, attendee check-in, and sales reports.',
  'Create a real estate CRM with listings, leads, agents, follow-ups, pipeline stages, and broker dashboards.',
  'Build a helpdesk system with tickets, priorities, SLA tracking, assignments, canned responses, and customer portal.',
  'Create a subscription analytics dashboard with plans, payments, churn metrics, cohorts, invoices, and admin exports.',
];

export const edgeCasePrompts = [
  'Build me an app.',
  'Make a dashboard but no database and also store customer history forever.',
  'I need login, maybe payments, not sure, for something like a marketplace.',
  'Create an app where guests can delete all admin data but security must be high.',
  'Build CRM CRM CRM with contacts contacts contacts and admin admin admin.',
  'Make a SaaS with premium features, but all premium features should be free to everyone.',
  'Create a healthcare app with no auth, public patient records, and HIPAA-grade security.',
  'Build an API only product but include a rich React dashboard and mobile screens.',
  'Need reports and analytics, but there is no data source yet.',
  'Generate a system for roles: admin, manager, manager, user, ghost role, and payments later.',
];

export const evaluationPrompts = [
  ...productPrompts.map(prompt => ({ type: 'product', prompt })),
  ...edgeCasePrompts.map(prompt => ({ type: 'edge', prompt })),
];
