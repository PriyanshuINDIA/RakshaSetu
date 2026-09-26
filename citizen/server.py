"""
RakshaSetu Legacy Server Shim
Forwards execution directly to citizen/test_server.py.
All obsolete mock operational endpoints and synthetic disaster fixtures have been removed.
"""

from test_server import run_server, PORT

if __name__ == '__main__':
    run_server(PORT)
