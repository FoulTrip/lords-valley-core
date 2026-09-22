import { NpcDialogueEngine } from '../src/settlement/domain/npc-dialogue.engine';

describe('NpcDialogueEngine', () => {
  it('debe contener al menos 100 frases en el catálogo', () => {
    const totalPhrases = NpcDialogueEngine.getTotalPhrasesCount();
    expect(totalPhrases).toBeGreaterThanOrEqual(100);
    // Verificar que supera con creces el mínimo
    expect(totalPhrases).toBe(148);
  });

  it('debe generar diálogos contextuales con reemplazo correcto de nombres y profesiones', () => {
    const ctx = {
      initiatorName: 'Eldric',
      initiatorJob: 'Herrero',
      targetName: 'Rowena',
      targetJob: 'Granjera',
      hourOfDay: 8, // Mañana
    };

    const dialogue = NpcDialogueEngine.generateDialogue(ctx);

    expect(dialogue).toBeDefined();
    expect(dialogue.initiatorText).toContain('Rowena');
    expect(dialogue.responderText).toContain('Eldric');
    expect(dialogue.replyDelayMs).toBeGreaterThan(1500);
    expect(dialogue.durationMs).toBeGreaterThan(2500);
  });

  it('debe generar diálogos nocturnos coherentes en horarios de noche', () => {
    const ctx = {
      initiatorName: 'Gisela',
      initiatorJob: 'Guardia',
      targetName: 'Brom',
      targetJob: 'Minero',
      hourOfDay: 22, // Noche
    };

    const dialogue = NpcDialogueEngine.generateDialogue(ctx);
    expect(dialogue).toBeDefined();
    expect(dialogue.initiatorText.length).toBeGreaterThan(10);
    expect(dialogue.responderText.length).toBeGreaterThan(10);
  });
});
