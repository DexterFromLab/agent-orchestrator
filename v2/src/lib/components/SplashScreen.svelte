<script lang="ts">
  import splashImg from '../../assets/splash.jpg';

  interface Props {
    steps: { label: string; done: boolean }[];
    version?: string;
  }

  let { steps, version = 'v3' }: Props = $props();

  let doneCount = $derived(steps.filter(s => s.done).length);
  let progress = $derived(steps.length > 0 ? doneCount / steps.length : 0);
  let currentStep = $derived(steps.find(s => !s.done)?.label ?? 'Ready');
</script>

<div class="splash">
  <img src={splashImg} alt="" class="splash-bg" />
  <div class="splash-overlay"></div>

  <div class="splash-content">
    <div class="splash-title">
      <h1>Agent Orchestrator</h1>
      <span class="splash-version">{version}</span>
      <span class="splash-codename">Pandora's Box</span>
    </div>

    <div class="splash-progress">
      <div class="progress-bar">
        <div class="progress-fill" style:width="{progress * 100}%"></div>
      </div>
      <div class="progress-label">{currentStep}</div>
    </div>
  </div>
</div>

<style>
  .splash {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #1e1e2e;
    z-index: 9999;
  }

  .splash-bg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    opacity: 0.4;
    filter: blur(2px);
  }

  .splash-overlay {
    position: absolute;
    inset: 0;
    background: linear-gradient(
      180deg,
      rgba(30, 30, 46, 0.3) 0%,
      rgba(30, 30, 46, 0.6) 50%,
      rgba(30, 30, 46, 0.95) 100%
    );
  }

  .splash-content {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2rem;
    width: min(480px, 90vw);
  }

  .splash-title {
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
  }

  .splash-title h1 {
    font-size: 1.8rem;
    font-weight: 700;
    color: #cdd6f4;
    margin: 0;
    letter-spacing: 0.02em;
    text-shadow: 0 2px 12px rgba(203, 166, 247, 0.3);
  }

  .splash-version {
    font-size: 0.75rem;
    color: #a6adc8;
    font-weight: 500;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .splash-codename {
    font-size: 0.7rem;
    color: #cba6f7;
    font-style: italic;
    opacity: 0.8;
  }

  .splash-progress {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .progress-bar {
    width: 100%;
    height: 3px;
    background: rgba(108, 112, 134, 0.3);
    border-radius: 2px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #cba6f7, #89b4fa);
    border-radius: 2px;
    transition: width 0.3s ease;
  }

  .progress-label {
    font-size: 0.7rem;
    color: #6c7086;
    text-align: center;
    min-height: 1em;
  }
</style>
