# Electronics loan hedge implementation plan

1. Extend the game building extractor and bundled raw data with both yearly
   recipe directives; cover parsing and malformed input with tests.
2. Add pure analysis functions for yearly recipe costs, electronics price
   history, compatible used ships, exact financing, break-even prices, and
   best/base/worst trade decisions; write failing tests first.
3. Render the analysis from save data in the History tab with German and
   English evidence/caveat labels.
4. Add browser coverage for recipe pressure, candidate visibility, and the
   distinction between a cheap loan and a profitable trade.
5. Run the complete test suite, syntax checks, and real browser screenshots;
   then merge and push only after the result is verified.
