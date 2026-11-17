//! Agendamento recorrente (M11) — núcleo puro e determinístico.
//!
//! Este módulo NÃO toca em relógio real, filesystem ou SQLite. Ele implementa a
//! lógica de "estamos dentro da janela de execução autorizada?" como função pura,
//! para que seja testável sem mocks e imune a drift de horário do Windows.
//!
//! Políticas materializadas:
//!
//! - Nenhuma aquisição fora da janela. `window_status` devolve `allowed_to_acquire=false`
//!   quando: schedule desabilitado, dia da semana não selecionado, horário atual
//!   antes/depois da janela, OU limite de tarefas da janela atingido.
//! - Janelas que cruzam meia-noite (ex.: 22:00 → 06:00) pertencem AO DIA DE INÍCIO:
//!   a janela só começa num `start_dow` autorizado e se estende até o próximo dia
//!   natural. Isso é determinístico e evita que um turno noturno "misture" dois dias
//!   configurados independentemente.
//! - Nenhuma automação de ato oficial está envolvida aqui. O agendamento apenas
//!   libera/trava a chamada a `acquire_next_pending` do M7.
//! - `max_tasks_per_window=0` desabilita aquisição mesmo dentro da janela — útil
//!   como "freio" rápido sem desabilitar o schedule.
//!
//! O que NÃO está neste módulo:
//! - Integração com Windows Task Scheduler (aplicativo precisa estar aberto). Fica
//!   para M13 se o usuário pedir — exige criar tarefa agendada via `schtasks.exe` e
//!   habilitação explícita do usuário.
//! - Persistência: a camada superior serializa `ScheduleConfig` como JSON e pode
//!   gravar via `storage::secure_write` (M12) ou arquivo plano. `ScheduleConfig`
//!   deriva serde para qualquer caminho.

use serde::{Deserialize, Serialize};

pub const MINUTES_PER_DAY: u32 = 24 * 60;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ScheduleConfig {
    pub enabled: bool,
    /// 0 = Domingo … 6 = Sábado (compatível com `chrono::Weekday::num_days_from_sunday`).
    pub days_of_week: Vec<u32>,
    pub start_minute_of_day: u32,
    pub end_minute_of_day: u32,
    pub max_tasks_per_window: u32,
}

impl ScheduleConfig {
    pub fn default_disabled() -> Self {
        Self {
            enabled: false,
            days_of_week: vec![],
            start_minute_of_day: 8 * 60,
            end_minute_of_day: 18 * 60,
            max_tasks_per_window: 50,
        }
    }

    pub fn validate(&self) -> Result<(), String> {
        if self.start_minute_of_day >= MINUTES_PER_DAY {
            return Err(format!(
                "start_minute_of_day fora do dia: {}",
                self.start_minute_of_day
            ));
        }
        if self.end_minute_of_day >= MINUTES_PER_DAY {
            return Err(format!(
                "end_minute_of_day fora do dia: {}",
                self.end_minute_of_day
            ));
        }
        if self.start_minute_of_day == self.end_minute_of_day {
            return Err("Janela nula: start igual a end.".to_owned());
        }
        for day in &self.days_of_week {
            if *day > 6 {
                return Err(format!("dayOfWeek fora de 0..=6: {day}"));
            }
        }
        Ok(())
    }

    pub fn crosses_midnight(&self) -> bool {
        self.end_minute_of_day < self.start_minute_of_day
    }
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum WindowReason {
    Disabled,
    DayNotSelected,
    BeforeWindow,
    AfterWindow,
    TasksCapReached,
    InWindow,
    InvalidConfig,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowStatus {
    pub allowed_to_acquire: bool,
    pub in_window: bool,
    pub reason: WindowReason,
    pub tasks_done_in_window: u32,
    pub max_tasks_per_window: u32,
}

fn previous_dow(dow: u32) -> u32 {
    (dow + 6) % 7
}

pub fn window_status(
    config: &ScheduleConfig,
    now_dow: u32,
    now_minute_of_day: u32,
    tasks_done_in_window: u32,
) -> WindowStatus {
    if !config.enabled {
        return WindowStatus {
            allowed_to_acquire: false,
            in_window: false,
            reason: WindowReason::Disabled,
            tasks_done_in_window,
            max_tasks_per_window: config.max_tasks_per_window,
        };
    }
    if config.validate().is_err() {
        return WindowStatus {
            allowed_to_acquire: false,
            in_window: false,
            reason: WindowReason::InvalidConfig,
            tasks_done_in_window,
            max_tasks_per_window: config.max_tasks_per_window,
        };
    }
    if now_dow > 6 || now_minute_of_day >= MINUTES_PER_DAY {
        return WindowStatus {
            allowed_to_acquire: false,
            in_window: false,
            reason: WindowReason::InvalidConfig,
            tasks_done_in_window,
            max_tasks_per_window: config.max_tasks_per_window,
        };
    }

    let in_window = if config.crosses_midnight() {
        // Janela noturna que começa num dia autorizado e cruza para o próximo.
        // Parte "noite do dia autorizado": hoje é o dia autorizado, horário >= start.
        let starts_today = config.days_of_week.contains(&now_dow)
            && now_minute_of_day >= config.start_minute_of_day;
        // Parte "madrugada do dia seguinte": hoje é o dia POSTERIOR ao autorizado,
        // horário < end (ou seja, a janela que começou ontem ainda está rodando).
        let continues_from_yesterday = config.days_of_week.contains(&previous_dow(now_dow))
            && now_minute_of_day < config.end_minute_of_day;
        starts_today || continues_from_yesterday
    } else {
        config.days_of_week.contains(&now_dow)
            && now_minute_of_day >= config.start_minute_of_day
            && now_minute_of_day < config.end_minute_of_day
    };

    if !in_window {
        // Decide a razão específica para a UI poder explicar.
        let reason = if !config.days_of_week.contains(&now_dow)
            && (!config.crosses_midnight() || !config.days_of_week.contains(&previous_dow(now_dow)))
        {
            WindowReason::DayNotSelected
        } else if config.crosses_midnight() {
            // Está no dia autorizado mas antes de start, ou no dia seguinte mas depois de end.
            if config.days_of_week.contains(&now_dow)
                && now_minute_of_day < config.start_minute_of_day
            {
                WindowReason::BeforeWindow
            } else {
                WindowReason::AfterWindow
            }
        } else if now_minute_of_day < config.start_minute_of_day {
            WindowReason::BeforeWindow
        } else {
            WindowReason::AfterWindow
        };
        return WindowStatus {
            allowed_to_acquire: false,
            in_window: false,
            reason,
            tasks_done_in_window,
            max_tasks_per_window: config.max_tasks_per_window,
        };
    }

    // Estamos na janela. Agora verificamos o cap de tarefas.
    if tasks_done_in_window >= config.max_tasks_per_window {
        return WindowStatus {
            allowed_to_acquire: false,
            in_window: true,
            reason: WindowReason::TasksCapReached,
            tasks_done_in_window,
            max_tasks_per_window: config.max_tasks_per_window,
        };
    }

    WindowStatus {
        allowed_to_acquire: true,
        in_window: true,
        reason: WindowReason::InWindow,
        tasks_done_in_window,
        max_tasks_per_window: config.max_tasks_per_window,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn h(h: u32, m: u32) -> u32 {
        h * 60 + m
    }

    const SUN: u32 = 0;
    const MON: u32 = 1;
    const TUE: u32 = 2;
    const WED: u32 = 3;
    const FRI: u32 = 5;

    fn weekdays() -> Vec<u32> {
        vec![MON, TUE, WED, 4, FRI]
    }

    #[test]
    fn disabled_schedule_never_allows_acquisition() {
        let cfg = ScheduleConfig::default_disabled();
        let st = window_status(&cfg, MON, h(10, 0), 0);
        assert!(!st.allowed_to_acquire);
        assert!(!st.in_window);
        assert_eq!(st.reason, WindowReason::Disabled);
    }

    #[test]
    fn simple_window_blocks_before_and_after() {
        let cfg = ScheduleConfig {
            enabled: true,
            days_of_week: weekdays(),
            start_minute_of_day: h(8, 0),
            end_minute_of_day: h(18, 0),
            max_tasks_per_window: 50,
        };
        let before = window_status(&cfg, MON, h(6, 0), 0);
        assert!(!before.allowed_to_acquire);
        assert_eq!(before.reason, WindowReason::BeforeWindow);

        let during = window_status(&cfg, MON, h(12, 0), 0);
        assert!(during.allowed_to_acquire);
        assert!(during.in_window);
        assert_eq!(during.reason, WindowReason::InWindow);

        let after = window_status(&cfg, MON, h(19, 0), 0);
        assert!(!after.allowed_to_acquire);
        assert_eq!(after.reason, WindowReason::AfterWindow);
    }

    #[test]
    fn window_excludes_the_exact_end_minute() {
        // Janela 08:00-18:00 inclui 08:00 e exclui 18:00.
        let cfg = ScheduleConfig {
            enabled: true,
            days_of_week: weekdays(),
            start_minute_of_day: h(8, 0),
            end_minute_of_day: h(18, 0),
            max_tasks_per_window: 50,
        };
        let at_start = window_status(&cfg, MON, h(8, 0), 0);
        assert!(at_start.allowed_to_acquire, "08:00 deve estar na janela");
        let at_end = window_status(&cfg, MON, h(18, 0), 0);
        assert!(
            !at_end.allowed_to_acquire,
            "18:00 deve estar fora da janela"
        );
    }

    #[test]
    fn day_not_selected_blocks() {
        let cfg = ScheduleConfig {
            enabled: true,
            days_of_week: weekdays(),
            start_minute_of_day: h(8, 0),
            end_minute_of_day: h(18, 0),
            max_tasks_per_window: 50,
        };
        let sunday = window_status(&cfg, SUN, h(12, 0), 0);
        assert!(!sunday.allowed_to_acquire);
        assert_eq!(sunday.reason, WindowReason::DayNotSelected);
    }

    #[test]
    fn tasks_cap_reached_blocks_even_in_window() {
        let cfg = ScheduleConfig {
            enabled: true,
            days_of_week: weekdays(),
            start_minute_of_day: h(8, 0),
            end_minute_of_day: h(18, 0),
            max_tasks_per_window: 3,
        };
        let full = window_status(&cfg, MON, h(12, 0), 3);
        assert!(!full.allowed_to_acquire);
        assert!(full.in_window);
        assert_eq!(full.reason, WindowReason::TasksCapReached);

        let over = window_status(&cfg, MON, h(12, 0), 10);
        assert!(!over.allowed_to_acquire);
        assert_eq!(over.reason, WindowReason::TasksCapReached);
    }

    #[test]
    fn zero_cap_always_blocks_even_in_window() {
        let cfg = ScheduleConfig {
            enabled: true,
            days_of_week: weekdays(),
            start_minute_of_day: h(8, 0),
            end_minute_of_day: h(18, 0),
            max_tasks_per_window: 0,
        };
        let st = window_status(&cfg, MON, h(12, 0), 0);
        assert!(!st.allowed_to_acquire);
        assert_eq!(st.reason, WindowReason::TasksCapReached);
    }

    #[test]
    fn midnight_crossing_window_starts_on_selected_day() {
        // Janela 22:00 → 06:00 em segundas. Então:
        //  - Mon 23:00: dentro (noite da segunda)
        //  - Tue 02:00: dentro (continuação da noite da segunda)
        //  - Tue 23:00: fora (terça não está selecionada)
        let cfg = ScheduleConfig {
            enabled: true,
            days_of_week: vec![MON],
            start_minute_of_day: h(22, 0),
            end_minute_of_day: h(6, 0),
            max_tasks_per_window: 50,
        };
        assert!(cfg.crosses_midnight());
        let mon_night = window_status(&cfg, MON, h(23, 0), 0);
        assert!(mon_night.allowed_to_acquire);

        let tue_dawn = window_status(&cfg, TUE, h(2, 0), 0);
        assert!(
            tue_dawn.allowed_to_acquire,
            "madrugada de terça segue a janela que começou segunda"
        );

        // Tue 07:00: yesterday (MON) had window that ended at 06:00 — classifica como AfterWindow.
        let tue_morning = window_status(&cfg, TUE, h(7, 0), 0);
        assert!(!tue_morning.allowed_to_acquire);
        assert_eq!(tue_morning.reason, WindowReason::AfterWindow);

        // Tue 23:00: mesma lógica — ontem rodou, hoje não é dia selecionado, não é início de nova janela.
        let tue_night = window_status(&cfg, TUE, h(23, 0), 0);
        assert!(!tue_night.allowed_to_acquire);
        assert_eq!(tue_night.reason, WindowReason::AfterWindow);

        // Quarta-feira é o primeiro dia totalmente fora da influência: previous_dow(WED)=TUE também não selecionado.
        let wed_noon = window_status(&cfg, WED, h(12, 0), 0);
        assert!(!wed_noon.allowed_to_acquire);
        assert_eq!(wed_noon.reason, WindowReason::DayNotSelected);

        // Mon antes de 22:00: antes da janela
        let mon_evening = window_status(&cfg, MON, h(21, 0), 0);
        assert!(!mon_evening.allowed_to_acquire);
        assert_eq!(mon_evening.reason, WindowReason::BeforeWindow);
    }

    #[test]
    fn midnight_crossing_window_with_two_adjacent_days_covers_two_full_nights() {
        // 22:00 → 06:00 com Mon e Tue. Terça 02:00 continua a noite da segunda.
        // Terça 23:00 começa a noite da terça. Quarta 02:00 continua a noite da terça.
        let cfg = ScheduleConfig {
            enabled: true,
            days_of_week: vec![MON, TUE],
            start_minute_of_day: h(22, 0),
            end_minute_of_day: h(6, 0),
            max_tasks_per_window: 50,
        };
        assert!(window_status(&cfg, MON, h(23, 0), 0).allowed_to_acquire);
        assert!(window_status(&cfg, TUE, h(2, 0), 0).allowed_to_acquire);
        assert!(window_status(&cfg, TUE, h(23, 0), 0).allowed_to_acquire);
        assert!(window_status(&cfg, WED, h(2, 0), 0).allowed_to_acquire);
        // Quarta 07:00 — fora.
        assert!(!window_status(&cfg, WED, h(7, 0), 0).allowed_to_acquire);
    }

    #[test]
    fn validate_rejects_zero_length_window_and_out_of_day_values() {
        let mut cfg = ScheduleConfig {
            enabled: true,
            days_of_week: vec![MON],
            start_minute_of_day: h(8, 0),
            end_minute_of_day: h(8, 0),
            max_tasks_per_window: 50,
        };
        assert!(cfg.validate().is_err());

        cfg.end_minute_of_day = MINUTES_PER_DAY;
        assert!(cfg.validate().is_err());

        cfg.end_minute_of_day = h(9, 0);
        cfg.days_of_week = vec![7];
        assert!(cfg.validate().is_err());
    }

    #[test]
    fn invalid_now_arguments_return_invalid_config() {
        let cfg = ScheduleConfig {
            enabled: true,
            days_of_week: vec![MON],
            start_minute_of_day: h(8, 0),
            end_minute_of_day: h(18, 0),
            max_tasks_per_window: 50,
        };
        let bad_dow = window_status(&cfg, 99, h(12, 0), 0);
        assert_eq!(bad_dow.reason, WindowReason::InvalidConfig);
        let bad_minute = window_status(&cfg, MON, MINUTES_PER_DAY, 0);
        assert_eq!(bad_minute.reason, WindowReason::InvalidConfig);
    }

    #[test]
    fn schedule_config_round_trips_through_json() {
        let cfg = ScheduleConfig {
            enabled: true,
            days_of_week: vec![MON, TUE, WED],
            start_minute_of_day: h(9, 30),
            end_minute_of_day: h(17, 45),
            max_tasks_per_window: 25,
        };
        let serialized = serde_json::to_string(&cfg).unwrap();
        assert!(serialized.contains("\"enabled\":true"));
        assert!(serialized.contains("\"daysOfWeek\""));
        let round: ScheduleConfig = serde_json::from_str(&serialized).unwrap();
        assert_eq!(round, cfg);
    }
}
