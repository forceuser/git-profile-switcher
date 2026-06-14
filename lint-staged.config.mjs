export default {
  "*.{ts,js,mjs,cjs}": ["oxlint --fix", "oxfmt"],
  "*.{json,md,yaml,yml}": ["oxfmt"],
};
