import { mount } from 'svelte';
import Instructions from './Instructions.svelte';
import '../style.css';

mount(Instructions, { target: document.getElementById('app')! });
