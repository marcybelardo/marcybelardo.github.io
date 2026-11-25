---
title: postvim
slug: postvim
date: 2026-11-26
description: A text editor for a post-coding world
tags:
  - project
  - coding
  - text-editor
  - rust
  - vim
draft: false
---
The modal text editor known as "vim" has existed since time immemorial. Its adherents stay loyal to its vision of simplicity, keyboard-focus, and extensibility, and in their united desire have made it what it is today. Vim, and its fork Neovim, are shining examples of open source development and what computers can be capable of.

But times change, and the old world cannot hold. As inheritors of its legacy, we respect where vim has brought us, but we must also keep looking forward at new horizons. Code, indeed text itself, is no longer confined to simple keystrokes. Physical and digital hands leave traces within computational systems, and we are finding new ways to do old work. Typing cannot live alone, but typing cannot die. Despite text no longer emanating only from our minds, we are ruled by it evermore. Vim cannot change; vim cannot stay the same.

_Postvim_ is a reassertion of what makes vim great— its commands, simplicity, its text-focus— and a challenge to preconceived notions of what vim _must_ be. We look back fondly, but we cannot give in to nostalgia. We will not assume compatibility, system-wise. We do not assert pre-included configuration and feature-completeness. There will be no language support outside of basic highlighting, no file navigators or plugin ecosystem, no key remapping and no slow-drip of features. You will edit the text, and you will close the program, and then, the rest of your life.

---

This was an interesting project to work on. As more of it took shape, I found the scope narrowing rather than enlarging. For years, I've tried to write a small text editor to simply flex my coding abilities, and now that I have the means to build a fully-featured editor with all the bells and whistles, I find it a tired exercise. I don't even open a text editor anymore, except for the occasional config file or markdown adjustment.

The world has simply moved faster than I was expecting, and while many are taking the opportunity to build the tools they've always wanted to have, I find that it's more interesting to look forward and build what is helpful. Vim, though Spartan in comparison to its successors, is still a very deep and complex project. It is a product of its time, when a text editor needed to do a hundred, a thousand more things than just write down words. I find that it writes words very well, but it does so much more on top of that.

In a way, _Postvim_ is targeted less at replacing vim than replacing vi or nano. It's coded in Rust, and I am planning to really audit its security well. I want the text-editing core to be rock-solid, and then do little else. If there are convenient vim motions that people find lacking, maybe those get pulled in. But I think the rest of the tooling and plugins are unnecessary when agents can do almost everything they need to do.

The first version of _Postvim_ was designed with human/agent cohabitation in mind. I had a vision of a headless text editor that provides the same kind of context information that the user has access to via UI. For any given moment, an agent can access whatever a user can see in their TUI. It became clear very quickly that this was unnecessary. All that information was useless if the user never even looks. In the end, what mattered the most was having a text editor that would quickly open your files and get out of your way. I believe this is a more honest tool, in that sense.

As time goes on and agents become a larger part of our work, it's worth constantly reassessing the ways we interact with computers, the interfaces we inhabit, and the tools we love. I think I'll always love vim, and in a way, _Postvim_ is more like an art project that tries to see vim again for what it's best at. I hope it can serve your needs well.

You can download the binaries and find install instructions on [GitHub](https://github.com/marcybelardo/postvim) or [Tangled](https://tangled.org/marcelinebelardo.com/postvim).