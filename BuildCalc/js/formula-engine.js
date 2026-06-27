/**
 * FormulaEngine - Safe expression evaluator for BuildCalc
 * Implements tokenizer + recursive-descent parser
 * NO eval() or Function constructor used
 * 
 * Feature: buildcalc-dynamic-config
 * Requirements: 4.9, 4.10, 4.11, 4.12, 11.1, 11.2, 11.3, 11.4, 11.5, 11.6
 */
var FormulaEngine = (function () {
  'use strict';

  var MAX_LENGTH = 500;

  // Token type constants
  var TOKEN_NUMBER = 'NUMBER';
  var TOKEN_VARIABLE = 'VARIABLE';
  var TOKEN_OPERATOR = 'OPERATOR';
  var TOKEN_LPAREN = 'LPAREN';
  var TOKEN_RPAREN = 'RPAREN';
  var TOKEN_EOF = 'EOF';

  /**
   * Tokenize a formula string into an array of tokens.
   * @param {string} expr - The formula text
   * @returns {{ tokens: Array|null, error: string|null }}
   */
  function tokenize(expr) {
    if (typeof expr !== 'string') {
      return { tokens: null, error: 'Formula must be a string' };
    }
    if (expr.length > MAX_LENGTH) {
      return { tokens: null, error: 'Formula too long (max 500 characters)' };
    }

    var tokens = [];
    var i = 0;
    var len = expr.length;

    while (i < len) {
      var ch = expr[i];

      // Skip whitespace
      if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
        i++;
        continue;
      }

      // Check for assignment operator (=) that isn't part of another operator
      if (ch === '=') {
        return { tokens: null, error: "Invalid token: '=' at position " + i };
      }

      // Check for property access (dot)
      if (ch === '.') {
        return { tokens: null, error: "Invalid token: '.' at position " + i };
      }

      // Numbers: integer or decimal
      if (isDigit(ch)) {
        var numStart = i;
        while (i < len && isDigit(expr[i])) {
          i++;
        }
        // Check for decimal part
        if (i < len && expr[i] === '.') {
          i++;
          if (i < len && isDigit(expr[i])) {
            while (i < len && isDigit(expr[i])) {
              i++;
            }
          }
        }
        tokens.push({ type: TOKEN_NUMBER, value: parseFloat(expr.substring(numStart, i)) });
        continue;
      }

      // Decimal numbers starting with '.'  (e.g., .5)
      if (ch === '.' && i + 1 < len && isDigit(expr[i + 1])) {
        var numStart2 = i;
        i++; // skip the dot
        while (i < len && isDigit(expr[i])) {
          i++;
        }
        tokens.push({ type: TOKEN_NUMBER, value: parseFloat(expr.substring(numStart2, i)) });
        continue;
      }

      // Variables: starts with letter or underscore
      if (isAlpha(ch) || ch === '_') {
        var varStart = i;
        while (i < len && (isAlpha(expr[i]) || isDigit(expr[i]) || expr[i] === '_')) {
          i++;
        }
        var varName = expr.substring(varStart, i);

        // Check for property access: identifier.identifier
        if (i < len && expr[i] === '.') {
          return { tokens: null, error: "Invalid token: '.' at position " + i };
        }

        // Check for function call: identifier(
        // Skip whitespace before checking for paren
        var peekIdx = i;
        while (peekIdx < len && (expr[peekIdx] === ' ' || expr[peekIdx] === '\t')) {
          peekIdx++;
        }
        if (peekIdx < len && expr[peekIdx] === '(') {
          return { tokens: null, error: "Function calls are not allowed: '" + varName + "(' at position " + varStart };
        }

        tokens.push({ type: TOKEN_VARIABLE, value: varName });
        continue;
      }

      // Operators
      if (ch === '+' || ch === '-' || ch === '*' || ch === '/') {
        tokens.push({ type: TOKEN_OPERATOR, value: ch });
        i++;
        continue;
      }

      // Parentheses
      if (ch === '(') {
        tokens.push({ type: TOKEN_LPAREN, value: '(' });
        i++;
        continue;
      }
      if (ch === ')') {
        tokens.push({ type: TOKEN_RPAREN, value: ')' });
        i++;
        continue;
      }

      // Anything else is invalid
      return { tokens: null, error: "Invalid token: '" + ch + "' at position " + i };
    }

    tokens.push({ type: TOKEN_EOF, value: null });
    return { tokens: tokens, error: null };
  }

  /**
   * Parse and evaluate a tokenized expression with given variables.
   * @param {string} expr - Formula text
   * @param {Object} variables - { varName: numericValue, ... }
   * @returns {{ value: number|null, error: string|null }}
   */
  function evaluate(expr, variables) {
    var tokenResult = tokenize(expr);
    if (tokenResult.error) {
      return { value: null, error: tokenResult.error };
    }

    var tokens = tokenResult.tokens;
    var pos = 0;
    var vars = variables || {};

    function current() {
      return tokens[pos];
    }

    function consume() {
      var tok = tokens[pos];
      pos++;
      return tok;
    }

    // expression → term (('+' | '-') term)*
    function parseExpression() {
      var result = parseTerm();
      if (result.error) return result;

      while (current().type === TOKEN_OPERATOR && (current().value === '+' || current().value === '-')) {
        var op = consume().value;
        var right = parseTerm();
        if (right.error) return right;

        if (op === '+') {
          result = { value: result.value + right.value, error: null };
        } else {
          result = { value: result.value - right.value, error: null };
        }
      }

      return result;
    }

    // term → factor (('*' | '/') factor)*
    function parseTerm() {
      var result = parseFactor();
      if (result.error) return result;

      while (current().type === TOKEN_OPERATOR && (current().value === '*' || current().value === '/')) {
        var op = consume().value;
        var right = parseFactor();
        if (right.error) return right;

        if (op === '*') {
          result = { value: result.value * right.value, error: null };
        } else {
          if (right.value === 0) {
            return { value: null, error: 'Division by zero' };
          }
          result = { value: result.value / right.value, error: null };
        }
      }

      return result;
    }

    // factor → NUMBER | VARIABLE | '(' expression ')' | '-' factor
    function parseFactor() {
      var tok = current();

      // Unary minus
      if (tok.type === TOKEN_OPERATOR && tok.value === '-') {
        consume();
        var inner = parseFactor();
        if (inner.error) return inner;
        return { value: -inner.value, error: null };
      }

      // Number literal
      if (tok.type === TOKEN_NUMBER) {
        consume();
        return { value: tok.value, error: null };
      }

      // Variable reference
      if (tok.type === TOKEN_VARIABLE) {
        consume();
        if (!vars.hasOwnProperty(tok.value)) {
          return { value: null, error: "Undefined variable: '" + tok.value + "'" };
        }
        var val = vars[tok.value];
        if (typeof val !== 'number' || isNaN(val)) {
          return { value: null, error: "Variable '" + tok.value + "' is not a valid number" };
        }
        return { value: val, error: null };
      }

      // Parenthesized expression
      if (tok.type === TOKEN_LPAREN) {
        consume(); // eat '('
        var result = parseExpression();
        if (result.error) return result;

        if (current().type !== TOKEN_RPAREN) {
          return { value: null, error: "Expected ')' at position " + pos };
        }
        consume(); // eat ')'
        return result;
      }

      // Unexpected token
      if (tok.type === TOKEN_EOF) {
        return { value: null, error: 'Unexpected end of expression' };
      }
      return { value: null, error: "Unexpected token '" + tok.value + "' at position " + pos };
    }

    var result = parseExpression();
    if (result.error) return result;

    // Ensure all tokens consumed
    if (current().type !== TOKEN_EOF) {
      return { value: null, error: "Unexpected token '" + current().value + "' at position " + pos };
    }

    return { value: result.value, error: null };
  }

  /**
   * Validate formula syntax without full evaluation.
   * @param {string} expr - Formula text
   * @param {string[]} allowedVars - List of valid variable names for scope
   * @returns {{ valid: boolean, error: string|null }}
   */
  function validate(expr, allowedVars) {
    var tokenResult = tokenize(expr);
    if (tokenResult.error) {
      return { valid: false, error: tokenResult.error };
    }

    var tokens = tokenResult.tokens;
    var allowed = allowedVars || [];
    var pos = 0;

    function current() {
      return tokens[pos];
    }

    function consume() {
      var tok = tokens[pos];
      pos++;
      return tok;
    }

    // expression → term (('+' | '-') term)*
    function parseExpression() {
      var err = parseTerm();
      if (err) return err;

      while (current().type === TOKEN_OPERATOR && (current().value === '+' || current().value === '-')) {
        consume();
        err = parseTerm();
        if (err) return err;
      }

      return null;
    }

    // term → factor (('*' | '/') factor)*
    function parseTerm() {
      var err = parseFactor();
      if (err) return err;

      while (current().type === TOKEN_OPERATOR && (current().value === '*' || current().value === '/')) {
        consume();
        err = parseFactor();
        if (err) return err;
      }

      return null;
    }

    // factor → NUMBER | VARIABLE | '(' expression ')' | '-' factor
    function parseFactor() {
      var tok = current();

      // Unary minus
      if (tok.type === TOKEN_OPERATOR && tok.value === '-') {
        consume();
        return parseFactor();
      }

      // Number literal
      if (tok.type === TOKEN_NUMBER) {
        consume();
        return null;
      }

      // Variable reference
      if (tok.type === TOKEN_VARIABLE) {
        consume();
        if (allowed.indexOf(tok.value) === -1) {
          return "Undefined variable: '" + tok.value + "'";
        }
        return null;
      }

      // Parenthesized expression
      if (tok.type === TOKEN_LPAREN) {
        consume(); // eat '('
        var err = parseExpression();
        if (err) return err;

        if (current().type !== TOKEN_RPAREN) {
          return "Expected ')' at position " + pos;
        }
        consume(); // eat ')'
        return null;
      }

      // Unexpected token
      if (tok.type === TOKEN_EOF) {
        return 'Unexpected end of expression';
      }
      return "Unexpected token '" + tok.value + "' at position " + pos;
    }

    var err = parseExpression();
    if (err) {
      return { valid: false, error: err };
    }

    // Ensure all tokens consumed
    if (current().type !== TOKEN_EOF) {
      return { valid: false, error: "Unexpected token '" + current().value + "' at position " + pos };
    }

    return { valid: true, error: null };
  }

  /**
   * Get the list of variables referenced in a formula.
   * @param {string} expr - Formula text
   * @returns {string[]} Array of variable names found
   */
  function extractVariables(expr) {
    var tokenResult = tokenize(expr);
    if (tokenResult.error) {
      return [];
    }

    var variables = [];
    var seen = {};
    var tokens = tokenResult.tokens;

    for (var i = 0; i < tokens.length; i++) {
      if (tokens[i].type === TOKEN_VARIABLE) {
        var name = tokens[i].value;
        if (!seen[name]) {
          seen[name] = true;
          variables.push(name);
        }
      }
    }

    return variables;
  }

  // ─── Helpers ───────────────────────────────────────────────

  function isDigit(ch) {
    return ch >= '0' && ch <= '9';
  }

  function isAlpha(ch) {
    return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z');
  }

  // ─── Public API ────────────────────────────────────────────

  return {
    tokenize: tokenize,
    evaluate: evaluate,
    validate: validate,
    extractVariables: extractVariables
  };
})();
