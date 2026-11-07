import { mount } from 'svelte';
import '../instructions/page.css';
import { installBackdrop } from '../instructions/page';
import Profile from './Profile.svelte';

installBackdrop();
mount(Profile, { target: document.getElementById('app')! });
