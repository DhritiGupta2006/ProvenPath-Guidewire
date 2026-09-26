package provenpath.eval

uses org.junit.jupiter.api.Test
uses org.junit.jupiter.api.Assertions

class RunEvalTest {

  @Test
  function testEvalClassExists() {
    Assertions.assertNotNull(RunEval)
  }
}
