FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1

# System dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    python3-gi \
    python3-gi-cairo \
    gir1.2-gtk-3.0 \
    gir1.2-vte-2.91 \
    gir1.2-gdk-3.0 \
    dbus-x11 \
    xauth \
    openssh-client \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# Create app user with UID 1000 (matches typical host user for volume write access)
RUN userdel -r ubuntu 2>/dev/null || true \
 && useradd -m -u 1000 -s /bin/bash bterminal

# Install app files
RUN mkdir -p /opt/bterminal /home/bterminal/.local/bin /home/bterminal/.local/share/bterminal \
             /home/bterminal/.config/bterminal /home/bterminal/.claude-context

COPY bterminal.py  /opt/bterminal/bterminal.py
COPY ctx           /opt/bterminal/ctx
COPY consult       /opt/bterminal/consult
COPY tasks         /opt/bterminal/tasks
COPY bterminal.svg /opt/bterminal/bterminal.svg

RUN chmod +x /opt/bterminal/bterminal.py \
             /opt/bterminal/ctx \
             /opt/bterminal/consult \
             /opt/bterminal/tasks

# Symlinks in PATH
RUN ln -s /opt/bterminal/bterminal.py /usr/local/bin/bterminal \
 && ln -s /opt/bterminal/ctx          /usr/local/bin/ctx \
 && ln -s /opt/bterminal/consult      /usr/local/bin/consult \
 && ln -s /opt/bterminal/tasks        /usr/local/bin/tasks

# Ownership
RUN chown -R bterminal:bterminal /opt/bterminal /home/bterminal

USER bterminal
WORKDIR /home/bterminal

# Init ctx database
RUN /opt/bterminal/ctx list >/dev/null 2>&1 || true

ENV HOME=/home/bterminal
ENV XDG_RUNTIME_DIR=/tmp/runtime-bterminal

CMD ["bterminal"]
