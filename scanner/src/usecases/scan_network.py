from libnmap.process import NmapProcess
from libnmap.parser import NmapParser


def scan_network():
   

    networks = ["192.168.10.0/24", "192.168.20.0/24"]

    for i in range(len(networks)):
        scan = NmapProcess(networks[i], "-sV")
        return_code = scan.run()
        result = []
        if return_code == 0:
            report = NmapParser.parse(scan.stdout)
            for host in report.hosts:
                print("Adresse IP :", host.address)
                print("État :", host.status)
                print(host.services)
                for serv in host.services:
                    pserv = "{0:>5s}/{1:3s}  {2:12s}  {3}".format(
                        str(serv.port),
                        serv.protocol,
                        serv.state,
                        serv.service)

                    print(pserv)

                machine = (host.address, host.status, host.services)
                    
                result.append(machine)
        else:
            print("Le scan a échoué :", scan.stderr)
    return result