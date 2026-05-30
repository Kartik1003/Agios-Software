// server/pipeline/ContextBuilder.js
// Constructs accumulated context per stage — each stage receives ALL prior outputs

/**
 * Build the context object for a given stage.
 * Stage 1: raw input only
 * Stage 2: raw input + Stage 1 IR
 * Stage 3: raw input + Stage 1 IR + Stage 2 architecture
 * Stage 4: raw input + all prior outputs
 *
 * @param {number} stageNumber - The target stage (1-4)
 * @param {string} rawInput - Original user NL input
 * @param {object} stageOutputs - Map of stage number → output object
 * @returns {string} JSON string context for the LLM
 */
export function buildContext(stageNumber, rawInput, stageOutputs = {}) {
  const context = {
    raw_input: rawInput,
  };

  // Only pass Stage 1 to Stage 2 to save tokens. 
  // By Stage 3, Stage 2 has fully absorbed all requirements.
  if (stageNumber == 2 && stageOutputs[1]) {
    context.stage1_intent = stageOutputs[1];
  }

  if (stageNumber >= 3 && stageOutputs[2]) {
    context.stage2_architecture = stageOutputs[2];
  }

  if (stageNumber >= 4 && stageOutputs[3]) {
    // Deep clone to avoid mutating the actual stored output
    const stage3Pruned = JSON.parse(JSON.stringify(stageOutputs[3]));
    
    // STRIP ui_config for Stage 4! 
    // Stage 4 generates backend business logic. The UI config (hex colors, pages, components) 
    // is irrelevant and wastes ~2,000 tokens, causing 413 limits on 8B models.
    delete stage3Pruned.ui_config;
    
    context.stage3_schemas = stage3Pruned;
  }

  // Use unformatted JSON to save thousands of tokens on whitespace
  return JSON.stringify(context);
}

/**
 * Build a summary description of accumulated context for prompt injection
 */
export function describeContext(stageNumber) {
  const descriptions = {
    1: 'You receive the raw natural language input describing an application.',
    2: 'You receive the raw input AND the Stage 1 Intent IR (typed intermediate representation with intent_type, features, actors, etc.).',
    3: 'You receive the raw input AND Stage 2 System Architecture (modules, entities, user_flows, roles, tech_stack).',
    4: 'You receive the raw input AND prior stage outputs: Stage 2 Architecture and Stage 3 Schemas.',
  };
  return descriptions[stageNumber] || '';
}
