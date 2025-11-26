module.exports = {
  extends: [
    'stylelint-config-standard-scss',
    'stylelint-order'
  ],
  plugins: ['stylelint-scss'],
  rules: {
    // CSS Modules support
    'selector-class-pattern': null,
    'no-descending-specificity': null,
    'property-no-unknown': [true, { 
      ignoreProperties: ['composes', 'compose-with']
    }],
    'selector-pseudo-class-no-unknown': [
      true,
      {
        ignorePseudoClasses: ['global', 'local', 'export']
      }
    ],
    
    // Formatting
    'rule-empty-line-before': [
      'always-multi-line',
      {
        except: ['first-nested'],
        ignore: ['after-comment']
      }
    ],
    'at-rule-empty-line-before': [
      'always',
      {
        except: ['blockless-after-same-name-blockless', 'first-nested'],
        ignore: ['after-comment']
      }
    ],
    
    // SCSS-specific rules
    'scss/at-rule-no-unknown': true,
    'scss/dollar-variable-pattern': '^[a-z][a-zA-Z0-9-_]+$',
    'scss/at-mixin-pattern': '^[a-z][a-zA-Z0-9-]+$',
    'scss/load-partial-extension': 'never',
    'scss/load-no-partial-leading-underscore': true,
    'scss/operator-no-unspaced': true,
    'scss/dollar-variable-colon-space-after': 'always',
    'scss/dollar-variable-colon-space-before': 'never',
    'scss/at-mixin-argumentless-call-parentheses': 'always'
  },
  ignoreFiles: [
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
  ],
};
