# Contributing to OBS Multistream Server

Thank you for considering contributing to the OBS Multistream Server! We welcome contributions from the community and are grateful for any help you can provide.

## 🤝 How to Contribute

### Reporting Bugs

If you find a bug, please create an issue with the following information:

1. **Bug Description**: A clear and concise description of the bug
2. **Steps to Reproduce**: Step-by-step instructions to reproduce the issue
3. **Expected Behavior**: What you expected to happen
4. **Actual Behavior**: What actually happened
5. **Environment**: 
   - OS (Linux/macOS/Windows)
   - Node.js version
   - Browser (if web-related)
   - OBS Studio version
6. **Logs**: Relevant log outputs from the application

### Suggesting Features

We welcome feature suggestions! Please create an issue with:

1. **Feature Description**: A clear description of the proposed feature
2. **Use Case**: Why this feature would be useful
3. **Implementation Ideas**: If you have thoughts on how it could be implemented

### Pull Requests

1. **Fork the Repository**: Create a fork of the project
2. **Create a Branch**: Create a feature branch from `main`
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. **Make Changes**: Implement your changes following our coding standards
4. **Test**: Ensure all tests pass and add new tests if needed
5. **Commit**: Use clear, descriptive commit messages
6. **Push**: Push your changes to your fork
7. **Create PR**: Submit a pull request to the main repository

### Coding Standards

#### JavaScript/Node.js
- Use ES6+ features where appropriate
- Follow consistent indentation (2 spaces)
- Use meaningful variable and function names
- Add JSDoc comments for functions and classes
- Use async/await instead of callbacks where possible

#### Code Style
```javascript
// Good
const processStream = async (streamId, options = {}) => {
  try {
    const result = await multistreamService.startStream(streamId, options);
    logger.info(`Stream ${streamId} started successfully`);
    return result;
  } catch (error) {
    logger.error(`Failed to start stream ${streamId}`, error);
    throw error;
  }
};

// Bad
function processStream(streamId,options,callback) {
  multistreamService.startStream(streamId,options,function(err,result) {
    if(err) {
      console.log('Error:',err);
      callback(err);
    } else {
      console.log('Success');
      callback(null,result);
    }
  });
}
```

#### HTML/CSS
- Use semantic HTML elements
- Follow BEM methodology for CSS classes
- Ensure responsive design
- Use modern CSS features (flexbox, grid)

#### Documentation
- Update README.md if your changes affect usage
- Add inline comments for complex logic
- Update API documentation for new endpoints
- Include examples in documentation

### Testing

#### Running Tests
```bash
npm test
```

#### Writing Tests
- Write unit tests for new functions
- Include integration tests for API endpoints
- Test error conditions and edge cases
- Maintain test coverage above 80%

Example test structure:
```javascript
describe('MultistreamService', () => {
  describe('startMultistream', () => {
    it('should start streaming to all enabled platforms', async () => {
      // Test implementation
    });

    it('should handle errors gracefully', async () => {
      // Error test implementation
    });
  });
});
```

### Development Setup

1. **Clone and Install**
   ```bash
   git clone <your-fork>
   cd StreaminDoDo
   npm install
   ```

2. **Environment Setup**
   ```bash
   cp .env.example .env
   # Edit .env with test credentials
   ```

3. **Start Development Server**
   ```bash
   npm run dev
   ```

4. **Run Tests**
   ```bash
   npm test
   ```

### Commit Message Guidelines

Use conventional commits for clear history:

- `feat:` New features
- `fix:` Bug fixes
- `docs:` Documentation changes
- `style:` Code style changes (formatting, etc.)
- `refactor:` Code refactoring
- `test:` Adding or updating tests
- `chore:` Maintenance tasks

Examples:
```
feat: add support for custom RTMP endpoints
fix: resolve stream disconnection on platform error
docs: update OBS configuration guide
refactor: improve error handling in multistream service
```

### Areas for Contribution

We especially welcome contributions in these areas:

#### High Priority
- **Testing**: Increase test coverage
- **Documentation**: Improve setup guides and API docs
- **Performance**: Optimize stream processing
- **Error Handling**: Better error messages and recovery

#### Medium Priority
- **UI/UX**: Dashboard improvements
- **Features**: New streaming platforms
- **Monitoring**: Enhanced analytics
- **Security**: Authentication and authorization

#### Low Priority
- **Internationalization**: Multi-language support
- **Mobile**: Mobile-responsive improvements
- **Themes**: Customizable dashboard themes

### Code Review Process

1. **Automated Checks**: All PRs must pass automated tests
2. **Peer Review**: At least one maintainer review required
3. **Testing**: Manual testing for significant changes
4. **Documentation**: Ensure documentation is updated

### Community Guidelines

- **Be Respectful**: Treat all contributors with respect
- **Be Constructive**: Provide helpful feedback
- **Be Patient**: Understand that reviews take time
- **Be Collaborative**: Work together to improve the project

### Getting Help

- **Issues**: Check existing issues for similar problems
- **Discussions**: Use GitHub Discussions for questions
- **Discord**: Join our community Discord server
- **Email**: Contact maintainers directly for sensitive issues

### Recognition

Contributors will be:
- Listed in the README.md contributors section
- Mentioned in release notes for significant contributions
- Invited to join the core team for outstanding contributions

## 📋 Pull Request Template

When creating a pull request, please include:

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Tests pass locally
- [ ] New tests added for new functionality
- [ ] Manual testing completed

## Checklist
- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] No breaking changes (or properly documented)
```

## 🙏 Thank You

Every contribution, no matter how small, helps make this project better. We appreciate your time and effort in contributing to the OBS Multistream Server!

---

For questions about contributing, please open an issue or contact the maintainers.