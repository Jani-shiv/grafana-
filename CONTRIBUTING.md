# Contributing to Stellarmind

Thank you for your interest in contributing to the Stellarmind observability stack! This document provides guidelines and instructions for contributing.

## 🚀 Getting Started

1. **Fork the repository**
   ```bash
   git clone https://github.com/YOUR_USERNAME/grafana-.git
   cd grafana-
   ```

2. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

3. **Install dependencies**
   ```bash
   npm install
   ```

4. **Start development**
   ```bash
   npm run dev
   ```

## 📋 Before You Submit a PR

### Code Quality

1. **Run ESLint**
   ```bash
   npm run lint
   npm run lint:fix  # Auto-fix issues
   ```

2. **Format code**
   ```bash
   npm run format
   ```

3. **Run tests**
   ```bash
   npm test
   npm run test:coverage
   ```

4. **Security check**
   ```bash
   npm run security:audit
   ```

5. **Full validation**
   ```bash
   npm run validate
   ```

### Commit Messages

Follow conventional commits format:

```
feat: Add new monitoring dashboard
fix: Resolve metrics collection issue
docs: Update deployment guide
test: Add unit tests for checkout flow
refactor: Simplify metrics initialization
chore: Update dependencies
```

## 🧪 Testing Requirements

- Write tests for new features
- Maintain or improve test coverage
- Tests must pass locally before submitting PR

```bash
npm test -- --coverage
```

## 📝 Documentation

- Update README.md for user-facing changes
- Update CI-CD-GUIDE.md for workflow changes
- Add comments for complex logic
- Update CHANGELOG.md

## 🐳 Docker & Deployment

- Test Docker build locally
  ```bash
  npm run docker:build
  npm run docker:run
  ```

- Verify docker-compose works
  ```bash
  docker compose up -d
  docker compose logs
  ```

## 🔒 Security

- Never commit secrets
- Use GitHub secrets for sensitive data
- Follow security best practices
- Report security issues responsibly

## 🤔 Code Style Guidelines

### JavaScript

```javascript
// ✅ Good
const metricsCounter = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route'],
});

// ❌ Bad
var counter = new Counter({
  name: 'counter',
  help: 'counter'
});
```

### Error Handling

```javascript
// ✅ Good
try {
  const data = JSON.parse(fileContent);
  return data;
} catch (error) {
  logger.error('Failed to parse JSON', { error });
  return [];
}

// ❌ Bad
const data = JSON.parse(fileContent);  // No error handling
```

### Async/Await

```javascript
// ✅ Good
async function deployStack() {
  try {
    await dockerCompose.up();
    await healthCheck();
  } catch (error) {
    await rollback();
    throw error;
  }
}

// ❌ Bad
function deployStack() {
  dockerCompose.up().then(() => {
    // No error handling
  });
}
```

## 📤 Submitting a Pull Request

1. **Push your branch**
   ```bash
   git push origin feature/your-feature-name
   ```

2. **Create Pull Request**
   - Use the PR template
   - Fill in all sections
   - Link related issues

3. **PR Title Format**
   ```
   type: Brief description
   ```
   Examples:
   - `feat: Add Loki log aggregation`
   - `fix: Resolve Prometheus scrape timeout`
   - `docs: Update Azure deployment guide`

4. **Respond to Reviews**
   - Address feedback promptly
   - Push additional commits
   - Request re-review when ready

## 🎯 Types of Contributions

### Bug Fixes
- Clear description of the bug
- Steps to reproduce
- Expected vs actual behavior
- Proposed fix

### New Features
- RFC (Request for Comments) for major features
- Tests for new functionality
- Documentation updates
- Migration guide if breaking changes

### Documentation
- Clear, concise writing
- Accurate examples
- Link to relevant resources
- Update table of contents if needed

### Performance Improvements
- Benchmark before/after
- Explain optimization technique
- Test for regressions

## 🏆 Code Review Process

1. **Automated Checks**
   - ESLint: ✓ Must pass
   - Tests: ✓ Must pass
   - Security: ⚠️ Should pass (warnings ok)
   - Coverage: ✓ Should be maintained

2. **Human Review**
   - Minimum 1 approval required
   - Code owners: CODEOWNERS file
   - Maintainers review architecture

3. **Merge Criteria**
   - All checks pass
   - At least 1 approval
   - No conflicts
   - Commits are clean

## 📚 Resources

- [GitHub Actions Docs](https://docs.github.com/actions)
- [ESLint Rules](https://eslint.org/docs/rules)
- [Jest Guide](https://jestjs.io/docs/getting-started)
- [Prometheus Docs](https://prometheus.io/docs/)
- [Grafana Docs](https://grafana.com/docs/)

## 💬 Getting Help

- **Questions?** Open a discussion in GitHub Discussions
- **Found a bug?** Open an issue with details
- **Need help?** Comment on relevant issues
- **Chat?** Join our community discussions

## 📜 License

By contributing, you agree that your contributions will be licensed under the project's license (MIT).

## 🙏 Thank You!

Your contributions help make Stellarmind better for everyone. We appreciate your time and effort!

---

**Happy Contributing!** 🚀
