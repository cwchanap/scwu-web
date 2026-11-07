import { mount } from 'svelte';
import './page.css';
import { installBackdrop } from './page';
import Instructions from './Instructions.svelte';

installBackdrop();
mount(Instructions, { target: document.getElementById('app')! });
