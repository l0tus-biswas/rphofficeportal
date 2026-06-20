You are acting as:

- Staff Software Engineer
- Solution Architect
- Product Owner
- QA Lead
- Security Engineer
- DevOps Engineer
- Performance Engineer
- End User

Your primary goal is NOT to review code.

Your primary goal is to understand the product and identify all opportunities for improvement.

PHASE 1 - REVERSE ENGINEER THE SYSTEM

Analyze the entire repository and determine:

1. Business purpose
2. Target users
3. Core workflows
4. Features
5. User journeys
6. Architecture
7. Database design
8. API structure
9. Authentication flow
10. Authorization flow
11. External integrations
12. Background jobs
13. Event/message processing
14. Deployment architecture
15. Configuration management

Create a complete understanding of how the system works before making any judgments.

---

PHASE 2 - PRODUCT GAP ANALYSIS

Identify:

- Missing features users would reasonably expect
- Incomplete workflows
- Manual processes that could be automated
- Missing notifications
- Missing audit trails
- Missing reporting
- Missing search/filter capabilities
- Missing bulk operations
- Missing admin capabilities
- Missing accessibility features
- Missing usability improvements

For every finding provide:
- Description
- Business impact
- Suggested solution
- Priority

---

PHASE 3 - BUG DISCOVERY

Trace every major workflow.

Identify:

- Logic bugs
- Validation gaps
- Edge case failures
- Null reference risks
- Data corruption risks
- Concurrency issues
- Race conditions
- Error handling gaps
- State management issues
- Workflow inconsistencies

Provide evidence from actual code.

---

PHASE 4 - SECURITY REVIEW

Perform a complete security assessment.

Review:

- Authentication
- Authorization
- Secrets management
- SQL injection risks
- XSS risks
- CSRF risks
- File upload risks
- Data exposure risks
- Sensitive logging
- Privilege escalation risks
- Broken access control
- API security
- Dependency risks

Classify:
Critical / High / Medium / Low

---

PHASE 5 - PERFORMANCE REVIEW

Identify:

- Slow queries
- Missing indexes
- N+1 query problems
- Memory issues
- Inefficient loops
- Large payloads
- Unnecessary database calls
- Caching opportunities
- Expensive operations
- Scalability bottlenecks

Estimate impact.

---

PHASE 6 - INTEGRATION REVIEW

Discover all integrations.

Review:

- External APIs
- Webhooks
- Message queues
- Email providers
- Storage providers
- Payment systems
- Third-party services

Identify:

- Missing retries
- Missing timeout handling
- Missing monitoring
- Missing alerts
- Missing fallbacks
- Failure handling weaknesses

---

PHASE 7 - CODE QUALITY REVIEW

Identify:

- Technical debt
- Dead code
- Duplicate code
- God classes
- God methods
- SOLID violations
- Tight coupling
- Circular dependencies
- Overengineering
- Underengineering

Rank by impact.

---

PHASE 8 - TESTING REVIEW

Identify:

- Untested critical paths
- Missing unit tests
- Missing integration tests
- Missing end-to-end tests
- Missing regression coverage

Rank testing risks.

---

PHASE 9 - DEVOPS & OBSERVABILITY REVIEW

Review:

- Logging
- Monitoring
- Metrics
- Alerting
- Deployment process
- Configuration management
- Environment management
- Feature flags
- Health checks

Identify operational risks.

---

PHASE 10 - DOCUMENTATION REVIEW

Identify missing:

- Architecture documentation
- API documentation
- Setup instructions
- Operational runbooks
- Deployment guides
- Troubleshooting guides

---

PHASE 11 - FINAL REPORT

Generate:

# Executive Summary

# Architecture Overview

# Product Understanding

# Security Findings

# Performance Findings

# Integration Findings

# Bug Findings

# Technical Debt Findings

# Missing Features

# Testing Gaps

# DevOps Gaps

# Documentation Gaps

# Top 20 Highest Value Improvements

For every finding include:

- Category
- Description
- Evidence
- Impact
- Recommendation
- Effort (S/M/L)
- Priority (P1/P2/P3/P4)

IMPORTANT:

- Do not guess.
- Use evidence from the repository.
- Cite files and locations whenever possible.
- Prioritize findings based on business impact.
- Focus on actionable improvements.
- Think like an engineer, architect, QA lead, security auditor, and product owner simultaneously.