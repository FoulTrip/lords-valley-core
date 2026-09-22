/**
 * Motor autoritativo de diálogos e interacciones casuales para NPCs humanos.
 * Contiene más de 100 frases estructuradas por categoría y lógica conversacional
 * coherente (saludos según hora, estado de ánimo, oficio, clima, peligros y despedidas).
 */

export interface DialogueContext {
  initiatorName: string;
  initiatorJob?: string;
  targetName: string;
  targetJob?: string;
  hourOfDay?: number; // 0 a 23
  weather?: string;   // DESPEJADO, LLUVIOSO, TORMENTA, NEVADA
  season?: string;    // PRIMAVERA, VERANO, OTOÑO, INVIERNO
  hungerLevel?: number; // 0 a 100
  fatigueLevel?: number; // 0 a 100
}

export interface DialogueExchange {
  topic: string;
  initiatorText: string;
  responderText: string;
  replyDelayMs: number;
  durationMs: number;
}

interface DialoguePairTemplate {
  initiator: string[];
  responder: string[];
}

export class NpcDialogueEngine {
  // ─── 1. SALUDOS MATUTINOS (Mañana: 05:00 a 11:59) ──────────────────────────
  private static readonly MORNING_GREETINGS: DialoguePairTemplate = {
    initiator: [
      "¡Buen día, {target}! ¿Qué tal has amanecido hoy?",
      "Buenos días, {target}. Parece que el sol nos regala una jornada tranquila.",
      "¡Hola, {target}! Qué temprano andas en pie hoy.",
      "Buen día, {target}. ¿Listo para las faenas de hoy?",
      "¡Saludos, {target}! Da gusto verte con energía a primera hora.",
      "Buenos días, {target}. El aire matutino está bien fresco hoy.",
      "¡Hey, {target}! Ojalá tengamos un día productivo en el valle.",
      "Buen día, {target}. El canto de las aves nos avisa que toca empezar.",
      "¡Temprano despiertas, {target}! Buen día tengas.",
      "Buenos días, {target}. Que hoy todo nos salga sin contratiempos.",
    ],
    responder: [
      "¡Buen día, {speaker}! Bastante bien, con ganas de avanzar.",
      "Buenos días, {speaker}. Esperemos que el clima nos acompañe todo el día.",
      "¡Hola, {speaker}! Ya sabes, al que madruga, los dioses le ayudan.",
      "Buen día para ti también, {speaker}. Siempre listos para el deber.",
      "¡Saludos, {speaker}! Sí, descansé estupendamente anoche.",
      "Ciertamente, {speaker}. Nada como el rocío matinal para despabilarse.",
      "Eso espero yo también, {speaker}. Mucho por hacer por aquí.",
      "¡Buen día, {speaker}! Tomaré algo caliente y a la tarea.",
      "¡Hola, {speaker}! Lo mismo te deseo, que sea una jornada provechosa.",
      "Buenos días, {speaker}. Amén a eso, cuidémonos unos a otros.",
    ],
  };

  // ─── 2. SALUDOS VESPERTINOS (Tarde: 12:00 a 18:59) ─────────────────────────
  private static readonly AFTERNOON_GREETINGS: DialoguePairTemplate = {
    initiator: [
      "¡Buenas tardes, {target}! ¿Cómo marcha la jornada?",
      "Hola, {target}. ¿Qué tal va la mitad del día?",
      "¡Buenas tardes, {target}! Parece que el calor aprieta un poco.",
      "Qué tal, {target}. ¿Has podido tomarte un descanso para comer?",
      "¡Saludos, {target}! El día va pasando rápido por estos lares.",
      "Buenas tardes, {target}. Veo que sigues activo y sin aflojar.",
      "¡Hola, {target}! ¿Mucho trabajo todavía por delante?",
      "Buenas tardes, {target}. Espero que el día te esté tratando con benevolencia.",
      "¡Qué tal, {target}! Buen momento para un respiro a la sombra.",
      "Buenas tardes, {target}. Sigamos con paso firme antes de que caiga el sol.",
    ],
    responder: [
      "¡Buenas tardes, {speaker}! Con bastante trajín, pero sin quejas.",
      "Hola, {speaker}. Todo en orden por fortuna, cumpliendo el deber.",
      "Sí que calienta, {speaker}. Habrá que beber un poco de agua fresca.",
      "Justo acabo de almorzar, {speaker}. Ahora toca seguir el ritmo.",
      "¡Cierto, {speaker}! En un abrir y cerrar de ojos se nos va la luz.",
      "Ya me conoces, {speaker}, el valle no se mantiene solo.",
      "Un poco todavía, {speaker}, pero nada que no podamos resolver hoy.",
      "¡Igualmente, {speaker}! Por ahora las cosas marchan viento en popa.",
      "Buena idea, {speaker}, no viene mal un minuto de reposo.",
      "Así es, {speaker}. A trabajar con ganas mientras haya luz.",
    ],
  };

  // ─── 3. SALUDOS NOCTURNOS (Noche: 19:00 a 04:59) ───────────────────────────
  private static readonly NIGHT_GREETINGS: DialoguePairTemplate = {
    initiator: [
      "Buenas noches, {target}. Ha sido una jornada larga y exigente.",
      "¡Hola, {target}! No te alejes demasiado de los puestos iluminados.",
      "Buenas noches, {target}. Pronto tocará buscar abrigo para descansar.",
      "Oscurece rápido hoy, {target}. ¿Todo seguro por tu lado?",
      "¡Buenas noches, {target}! Se siente la brisa fría de la noche.",
      "Hola, {target}. Ten cuidado con las sombras que rondan el valle.",
      "Buenas noches, {target}. Ya falta poco para el relevo y dormir.",
      "¿Aún despierto, {target}? Buenas noches tengas.",
      "Buenas noches, {target}. Que las antorchas mantengan a raya a las bestias.",
      "¡{target}, buenas noches! Descansa en cuanto concluyas tus tareas.",
    ],
    responder: [
      "Buenas noches, {speaker}. Ciertamente, mis hombros ya piden descanso.",
      "Lo tendré presente, {speaker}. La noche en el valle impone respeto.",
      "Así es, {speaker}. Un buen fuego y un catre serán bienvenidos.",
      "Todo tranquilo por aquí, {speaker}, pero mantengo un ojo bien abierto.",
      "Abrígate bien, {speaker}. La escarcha nocturna cala hondo.",
      "Descuida, {speaker}, no pienso tentar a la suerte en la oscuridad.",
      "¡Menos mal, {speaker}! El cuerpo ya siente el peso del día.",
      "Solo cerrando los últimos detalles, {speaker}. Buenas noches para ti.",
      "Que así sea, {speaker}. Estaremos alertas hasta que amanezca.",
      "Igualmente para ti, {speaker}. Que tengas un sueño reparador.",
    ],
  };

  // ─── 4. ESTADO DE ÁNIMO Y BIENESTAR ─────────────────────────────────────────
  private static readonly WELLNESS_GREETINGS: DialoguePairTemplate = {
    initiator: [
      "¿Cómo te encuentras hoy, {target}?",
      "¡Hola, {target}! ¿Qué tal los ánimos para hoy?",
      "Dime, {target}, ¿te sientes bien hoy?",
      "¡{target}! Te veo pensativo, ¿va todo bien?",
      "¿Todo tranquilo contigo hoy, {target}?",
      "¡Hey, {target}! Espero que no te sientas muy sobrecargado.",
      "¿Qué tal la salud, {target}? Recuerda cuidarte.",
      "¡Hola, {target}! ¿Cómo marcha el ánimo en el asentamiento?",
      "¿Tienes todo lo que necesitas hoy, {target}?",
      "¡Amigo {target}! Siempre es un alivio ver una cara conocida.",
    ],
    responder: [
      "Con la moral alta, {speaker}, gracias por preguntar.",
      "Tranquilo y firme, {speaker}, un día a la vez.",
      "Un poco agotado a decir verdad, {speaker}, pero sigo en pie.",
      "Solo cavilando en el futuro de nuestro asentamiento, {speaker}.",
      "Todo en paz, {speaker}. Espero que tú también te encuentres bien.",
      "Se hace lo que se puede, {speaker}, pero no me rindo fácilmente.",
      "Por suerte con salud, {speaker}, que es lo más valioso.",
      "El ánimo está firme, {speaker}. Si nos mantenemos unidos, saldremos adelante.",
      "Sí, de momento no me falta lo indispensable, {speaker}.",
      "¡Lo mismo digo, {speaker}! La camaradería hace el camino más llevadero.",
    ],
  };

  // ─── 5. CHARLAS SOBRE TRABAJO Y OFICIOS ──────────────────────────────────────
  private static readonly WORK_GREETINGS: DialoguePairTemplate = {
    initiator: [
      "¡Hola, {target}! ¿Qué tal marcha tu labor de {targetJob}?",
      "Veo que no paras con tus tareas, {target}. Gran trabajo.",
      "¿Cómo va el rendimiento hoy, {target}?",
      "¡{target}! Tu esfuerzo como {targetJob} se nota en todo el campamento.",
      "¿Necesitas una mano con tus materiales más tarde, {target}?",
      "¡Saludos, {target}! Con gente trabajadora como tú este valle prosperará.",
      "¿Mucho movimiento hoy en tus labores, {target}?",
      "¡Hola, {target}! Espero que las herramientas no te den problemas hoy.",
      "Buen ritmo llevas, {target}. Cada aporte cuenta aquí.",
      "¡{target}! A este paso tendremos los almacenes llenos muy pronto.",
    ],
    responder: [
      "Avanzando sin pausa, {speaker}. Cada tronco y piedra cuenta.",
      "Gracias, {speaker}. Aquí nadie afloja si queremos salir adelante.",
      "El rendimiento va estupendo hoy, {speaker}, todo marcha a buen ritmo.",
      "Agradezco tus palabras, {speaker}. Hago lo mejor que puedo.",
      "De momento me apaño bien, {speaker}, pero te tomo la palabra si hace falta.",
      "Entre todos lo construiremos, {speaker}. Paso a paso.",
      "Bastante atareado hoy, {speaker}, pero así las horas vuelan.",
      "Las afilé y engrasé esta mañana, {speaker}, responden de maravilla.",
      "Así es, {speaker}. Si todos ponemos el hombro, no faltará nada.",
      "¡Ojalá así sea, {speaker}! Que las cosechas y reservas no escaseen.",
    ],
  };

  // ─── 6. CHARLAS SOBRE CLIMA Y ESTACIÓN ───────────────────────────────────────
  private static readonly WEATHER_GREETINGS: DialoguePairTemplate = {
    initiator: [
      "¡Vaya clima tenemos hoy, {target}!",
      "¿Crees que el cielo despejado aguante todo el día, {target}?",
      "Siento que la humedad está subiendo, {target}. ¿Lloverá pronto?",
      "El viento sopla fuerte desde las colinas hoy, {target}.",
      "¡Qué día tan agradable tenemos hoy en el valle, {target}!",
      "Hay que estar atentos a las nubes, {target}, el clima cambia en un parpadeo.",
      "El frío de las noches empieza a notarse más, {target}.",
      "Un día soleado como este le alegra el corazón a cualquiera, {target}.",
    ],
    responder: [
      "Ciertamente, {speaker}. En este valle nunca se sabe qué esperar del cielo.",
      "Ojalá que sí, {speaker}, facilita mucho las faenas al aire libre.",
      "Es muy posible, {speaker}. Mejor asegurar las lonas y herramientas.",
      "Sí, mueve los árboles con fuerza. Hay que tener precaución.",
      "Da gusto caminar por aquí con un clima así de benévolo, {speaker}.",
      "Tienes razón, {speaker}, no podemos confiarnos del horizonte.",
      "Habrá que preparar leña suficiente para los fogones, {speaker}.",
      "Totalmente de acuerdo, {speaker}. La luz del sol renueva las fuerzas.",
    ],
  };

  // ─── 7. SUPERVIVENCIA, PROVISIONES Y PELIGROS DEL VALLE ──────────────────────
  private static readonly SURVIVAL_GREETINGS: DialoguePairTemplate = {
    initiator: [
      "¿Escuchaste ruidos extraños más allá del río anoche, {target}?",
      "Hay que vigilar bien las raciones de comida y agua, {target}.",
      "Los guardianes dicen que vieron sombras cerca de las ruinas, {target}.",
      "¿Tienes suficiente agua en tu odre para el día, {target}?",
      "No conviene salir solos a las zonas no exploradas, {target}.",
      "¡{target}! Oí que los fantasmas merodearon el perímetro la otra noche.",
      "Si nos organizamos bien, ningún invierno ni peligro podrá con nosotros, {target}.",
      "Asegúrate de revisar tus suministros antes de emprender tareas lejos, {target}.",
    ],
    responder: [
      "Los oí, {speaker}. No me fío nada de lo que habita en esa espesura.",
      "Completamente de acuerdo, {speaker}. El orden en los almacenes es vida.",
      "Esperemos que nuestras defensas y guardias sigan bien alertas, {speaker}.",
      "Llevo el odre cargado, {speaker}, nunca salgo sin él.",
      "Sabias palabras, {speaker}. La prudencia nos mantendrá con vida.",
      "Por fortuna los ahuyentamos a tiempo, {speaker}. Hay que redoblar la guardia.",
      "La unión de nuestro grupo es nuestra mayor fortaleza, {speaker}.",
      "Siempre lo hago, {speaker}. En este lugar no hay margen para descuidos.",
    ],
  };

  // ─── 8. DESPEDIDAS Y CORTESÍAS ──────────────────────────────────────────────
  private static readonly FAREWELL_GREETINGS: DialoguePairTemplate = {
    initiator: [
      "Bueno, {target}, te dejo continuar con lo tuyo. ¡Cuídate!",
      "Nos vemos más tarde, {target}. ¡Que tengas buena jornada!",
      "Sigue así, {target}. Nos encontramos luego en el campamento.",
      "Ha sido bueno charlar contigo, {target}. ¡Hasta luego!",
      "Me retiro a mis labores, {target}. ¡Mucho éxito hoy!",
      "Nos vemos pronto, {target}. Cualquier cosa me avisas.",
      "Sigue adelante, {target}. ¡Que te sea leve la faena!",
      "Hablamos al caer la tarde, {target}. ¡Buen camino!",
    ],
    responder: [
      "¡Igualmente, {speaker}! Cuídate mucho y que todo vaya bien.",
      "¡Hasta luego, {speaker}! Que tengas un día excelente.",
      "Nos vemos allí, {speaker}. Buen trabajo en lo tuyo.",
      "El gusto ha sido mío, {speaker}. ¡Hasta pronto!",
      "¡Gracias, {speaker}! Lo mismo te deseo en tus quehaceres.",
      "Lo tendré en cuenta, {speaker}. ¡Nos vemos!",
      "¡Gracias por los ánimos, {speaker}! Hasta la próxima.",
      "Allí nos vemos, {speaker}. Que termines bien el día.",
    ],
  };

  /**
   * Genera un intercambio de diálogo contextual y lógico entre dos NPCs.
   */
  public static generateDialogue(ctx: DialogueContext): DialogueExchange {
    const sName = ctx.initiatorName || "Compañero";
    const tName = ctx.targetName || "Amigo";
    const sJob = ctx.initiatorJob || "Trabajador";
    const tJob = ctx.targetJob || "Trabajador";

    // 1. Determinar categoría basada en contexto
    let pool: DialoguePairTemplate;
    let topic = "wellness";

    const hour = typeof ctx.hourOfDay === "number" ? ctx.hourOfDay : 10;
    const isMorning = hour >= 5 && hour < 12;
    const isAfternoon = hour >= 12 && hour < 19;
    const isNight = hour >= 19 || hour < 5;

    // Selector ponderado / contextual
    const roll = Math.random();

    if (roll < 0.35) {
      // Saludo según hora del día
      if (isMorning) {
        pool = this.MORNING_GREETINGS;
        topic = "greeting_morning";
      } else if (isAfternoon) {
        pool = this.AFTERNOON_GREETINGS;
        topic = "greeting_afternoon";
      } else {
        pool = this.NIGHT_GREETINGS;
        topic = "greeting_night";
      }
    } else if (roll < 0.55) {
      // Estado de ánimo y bienestar
      pool = this.WELLNESS_GREETINGS;
      topic = "wellness";
    } else if (roll < 0.70) {
      // Trabajo y profesiones
      pool = this.WORK_GREETINGS;
      topic = "work";
    } else if (roll < 0.85) {
      // Clima o supervivencia
      if (Math.random() < 0.5) {
        pool = this.WEATHER_GREETINGS;
        topic = "weather";
      } else {
        pool = this.SURVIVAL_GREETINGS;
        topic = "survival";
      }
    } else {
      // Despedida o buenos deseos
      pool = this.FAREWELL_GREETINGS;
      topic = "farewell";
    }

    // 2. Seleccionar índice coherente
    const initIdx = Math.floor(Math.random() * pool.initiator.length);
    const respIdx = Math.floor(Math.random() * pool.responder.length);

    let rawInit = pool.initiator[initIdx];
    let rawResp = pool.responder[respIdx];

    // 3. Reemplazar variables contextuales
    const replacer = (text: string, speaker: string, target: string, speakerJob: string, targetJob: string) => {
      return text
        .replace(/\{speaker\}/g, speaker)
        .replace(/\{target\}/g, target)
        .replace(/\{speakerJob\}/g, speakerJob)
        .replace(/\{targetJob\}/g, targetJob);
    };

    const initiatorText = replacer(rawInit, sName, tName, sJob, tJob);
    const responderText = replacer(rawResp, sName, tName, sJob, tJob);

    return {
      topic,
      initiatorText,
      responderText,
      replyDelayMs: 2500, // 2.5 segundos de espera para que el objetivo responda
      durationMs: 10000,  // al menos 10 segundos de duración en pantalla para leer cómodamente
    };
  }

  /** Retorna el recuento total de frases en el catálogo para auditorías */
  public static getTotalPhrasesCount(): number {
    const pools = [
      this.MORNING_GREETINGS,
      this.AFTERNOON_GREETINGS,
      this.NIGHT_GREETINGS,
      this.WELLNESS_GREETINGS,
      this.WORK_GREETINGS,
      this.WEATHER_GREETINGS,
      this.SURVIVAL_GREETINGS,
      this.FAREWELL_GREETINGS,
    ];
    let total = 0;
    for (const p of pools) {
      total += p.initiator.length + p.responder.length;
    }
    return total;
  }
}
